use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteConnection},
    Connection, Row,
};
use tauri::{AppHandle, Manager};

const BACKUP_SCHEMA_VERSION: i64 = 6;

fn timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn backup_dir(app: &AppHandle, storage_root: Option<&str>) -> Result<PathBuf, String> {
    let path = if let Some(root) = storage_root {
        let root = PathBuf::from(root);
        if !root.is_absolute() {
            return Err("Storage path must be absolute".into());
        }
        fs::create_dir_all(&root).map_err(|error| error.to_string())?;
        root.join("Backups")
    } else {
        data_dir(app)?.join("backups")
    };
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn log_error(app: &AppHandle, message: &str) {
    let Ok(dir) = data_dir(app).map(|path| path.join("logs")) else {
        return;
    };
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = dir.join("second-brain.log");
    let line = format!("{} {}\n", timestamp(), message.replace('\n', " "));
    let _ = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .and_then(|mut file| std::io::Write::write_all(&mut file, line.as_bytes()));
}

fn safe_name(name: &str) -> Result<&Path, String> {
    let path = Path::new(name);
    if path.file_name().and_then(|value| value.to_str()) != Some(name) || !name.ends_with(".sbdb") {
        return Err("Invalid backup name".into());
    }
    Ok(path)
}

async fn connect(path: &Path) -> Result<SqliteConnection, sqlx::Error> {
    SqliteConnection::connect_with(
        &SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(false),
    )
    .await
}

async fn snapshot(source: &Path, destination: &Path) -> Result<(), String> {
    let mut connection = connect(source).await.map_err(|error| error.to_string())?;
    let escaped = destination.to_string_lossy().replace('\'', "''");
    sqlx::query(&format!("VACUUM INTO '{}'", escaped))
        .execute(&mut connection)
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

async fn add_metadata(path: &Path) -> Result<(), String> {
    let mut connection = connect(path).await.map_err(|error| error.to_string())?;
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS _second_brain_backup_metadata (
          schema_version INTEGER NOT NULL,
          app_version TEXT NOT NULL,
          created_at TEXT NOT NULL
        )",
    )
    .execute(&mut connection)
    .await
    .map_err(|error| error.to_string())?;
    sqlx::query("DELETE FROM _second_brain_backup_metadata")
        .execute(&mut connection)
        .await
        .map_err(|error| error.to_string())?;
    sqlx::query("INSERT INTO _second_brain_backup_metadata (schema_version, app_version, created_at) VALUES (?, ?, ?)")
        .bind(BACKUP_SCHEMA_VERSION).bind("0.1.0").bind(timestamp())
        .execute(&mut connection).await.map_err(|error| error.to_string())?;
    Ok(())
}

async fn validate(path: &Path) -> Result<(), String> {
    let mut connection = connect(path)
        .await
        .map_err(|_| "Backup is not a readable SQLite database".to_string())?;
    let integrity: String = sqlx::query("PRAGMA integrity_check")
        .fetch_one(&mut connection)
        .await
        .map_err(|_| "Could not validate SQLite integrity".to_string())?
        .try_get(0)
        .map_err(|_| "Could not read SQLite integrity result".to_string())?;
    if integrity != "ok" {
        return Err("SQLite integrity check failed".into());
    }
    for table in ["notes", "folders", "_second_brain_backup_metadata"] {
        let count: i64 =
            sqlx::query("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?")
                .bind(table)
                .fetch_one(&mut connection)
                .await
                .map_err(|_| "Backup schema is incomplete".to_string())?
                .try_get(0)
                .map_err(|_| "Backup schema is incomplete".to_string())?;
        if count != 1 {
            return Err("Backup schema is incomplete".into());
        }
    }
    let version: i64 = sqlx::query(
        "SELECT schema_version FROM _second_brain_backup_metadata ORDER BY rowid DESC LIMIT 1",
    )
    .fetch_one(&mut connection)
    .await
    .map_err(|_| "Backup metadata is missing".to_string())?
    .try_get(0)
    .map_err(|_| "Backup metadata is invalid".to_string())?;
    if !(2..=BACKUP_SCHEMA_VERSION).contains(&version) {
        return Err(format!("Unsupported backup schema version {version}"));
    }
    Ok(())
}

#[tauri::command]
pub async fn log_client_error(app: AppHandle, message: String) {
    log_error(&app, &message);
}

#[tauri::command]
pub async fn list_backups(
    app: AppHandle,
    storage_root: Option<String>,
) -> Result<Vec<String>, String> {
    let directory = backup_dir(&app, storage_root.as_deref())?;
    let mut names = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            (path.extension().and_then(|value| value.to_str()) == Some("sbdb"))
                .then(|| path.file_name()?.to_str().map(ToOwned::to_owned))
                .flatten()
        })
        .collect::<Vec<_>>();
    names.sort_by(|left, right| right.cmp(left));
    Ok(names)
}

#[tauri::command]
pub async fn create_backup(app: AppHandle, storage_root: Option<String>) -> Result<String, String> {
    let result = async {
        let source = data_dir(&app)?.join("second-brain.db");
        if !source.exists() {
            return Err("Database does not exist yet".to_string());
        }
        let directory = backup_dir(&app, storage_root.as_deref())?;
        let name = format!("backup-{}.sbdb", timestamp());
        let destination = directory.join(&name);
        snapshot(&source, &destination).await?;
        add_metadata(&destination).await?;
        validate(&destination).await?;
        Ok(name)
    }
    .await;
    if let Err(error) = &result {
        log_error(&app, &format!("backup failed: {error}"));
    }
    result
}

#[tauri::command]
pub async fn restore_backup(
    app: AppHandle,
    name: String,
    storage_root: Option<String>,
) -> Result<(), String> {
    let result = async {
        let safe = safe_name(&name)?;
        let source = backup_dir(&app, storage_root.as_deref())?.join(safe);
        if !source.exists() {
            return Err("Backup file was not found".to_string());
        }
        validate(&source).await?;

        let current = data_dir(&app)?.join("second-brain.db");
        let directory = backup_dir(&app, storage_root.as_deref())?;
        if current.exists() {
            let recovery_name = format!("recovery-{}.sbdb", timestamp());
            let recovery = directory.join(recovery_name);
            snapshot(&current, &recovery).await?;
            add_metadata(&recovery).await?;
            validate(&recovery).await?;
        }

        let temporary = data_dir(&app)?.join(format!("second-brain.restore-{}.db", timestamp()));
        fs::copy(&source, &temporary).map_err(|error| error.to_string())?;
        let previous = data_dir(&app)?.join(format!("second-brain.previous-{}.db", timestamp()));
        if current.exists() {
            fs::rename(&current, &previous).map_err(|error| error.to_string())?;
        }
        if let Err(error) = fs::rename(&temporary, &current) {
            if previous.exists() {
                let _ = fs::rename(&previous, &current);
            }
            return Err(error.to_string());
        }
        let _ = fs::remove_file(previous);
        Ok(())
    }
    .await;
    if let Err(error) = &result {
        log_error(&app, &format!("restore failed: {error}"));
        return result;
    }
    app.restart();
}
