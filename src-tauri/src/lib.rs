use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};
use sha2::{Digest, Sha384};
use sqlx::{sqlite::{SqliteConnectOptions, SqliteConnection}, Connection, Row};

mod backup;
mod note_operations;
mod storage;

const FOLDER_SCHEMA_MIGRATION_VERSION: i64 = 9;
const FOLDER_SCHEMA_MIGRATION_SQL: &str = include_str!("../migrations/009_rebuild_folders_for_scoped_names.sql");

async fn apply_folder_schema_migration(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let database_path = app.path().app_data_dir()?.join("second-brain.db");
    let mut connection = SqliteConnection::connect_with(
        &SqliteConnectOptions::new()
            .filename(database_path)
            .create_if_missing(false)
            .foreign_keys(false),
    )
    .await?;
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS _second_brain_schema_migrations (
            version INTEGER PRIMARY KEY NOT NULL,
            checksum TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&mut connection)
    .await?;

    let checksum = format!("{:x}", Sha384::digest(FOLDER_SCHEMA_MIGRATION_SQL.as_bytes()));
    let applied = sqlx::query("SELECT checksum FROM _second_brain_schema_migrations WHERE version = ?")
        .bind(FOLDER_SCHEMA_MIGRATION_VERSION)
        .fetch_optional(&mut connection)
        .await?;
    if let Some(row) = applied {
        let applied_checksum: String = row.try_get("checksum")?;
        if applied_checksum != checksum {
            return Err(format!("Folder schema migration {FOLDER_SCHEMA_MIGRATION_VERSION} was previously applied but has been modified").into());
        }
        return Ok(());
    }

    sqlx::query("PRAGMA foreign_keys = OFF").execute(&mut connection).await?;
    if let Err(error) = sqlx::raw_sql(FOLDER_SCHEMA_MIGRATION_SQL).execute(&mut connection).await {
        let _ = sqlx::query("PRAGMA foreign_keys = ON").execute(&mut connection).await;
        return Err(error.into());
    }
    let foreign_key_errors = sqlx::query("PRAGMA foreign_key_check").fetch_all(&mut connection).await?;
    if !foreign_key_errors.is_empty() {
        return Err("Folder schema migration produced foreign-key violations".into());
    }
    sqlx::query("INSERT INTO _second_brain_schema_migrations (version, checksum) VALUES (?, ?)")
        .bind(FOLDER_SCHEMA_MIGRATION_VERSION)
        .bind(checksum)
        .execute(&mut connection)
        .await?;
    Ok(())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_notes",
            sql: include_str!("../migrations/001_create_notes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_folders_and_note_format",
            sql: include_str!("../migrations/002_add_folders_and_note_format.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_storage_and_attachments",
            sql: include_str!("../migrations/003_add_storage_and_attachments.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "extend_attachments",
            sql: include_str!("../migrations/004_extend_attachments.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_link_previews",
            sql: include_str!("../migrations/005_add_link_previews.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_richtext_documents",
            sql: include_str!("../migrations/006_add_richtext_documents.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add_folder_tree_and_soft_delete",
            sql: include_str!("../migrations/007_add_folder_tree_and_soft_delete.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add_note_attachment_relations",
            sql: include_str!("../migrations/008_add_note_attachment_relations.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:second-brain.db", migrations)
                .build(),
        )
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(data_dir.join("backups"))?;
            std::fs::create_dir_all(data_dir.join("logs"))?;
            tauri::async_runtime::block_on(apply_folder_schema_migration(app.handle()))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            backup::create_backup,
            backup::list_backups,
            backup::restore_backup,
            backup::log_client_error,
            note_operations::trash_note,
            note_operations::restore_note,
            note_operations::trash_folder_tree,
            note_operations::restore_folder_tree,
            note_operations::permanently_delete_note,
            note_operations::permanently_delete_folder_tree,
            exit_app,
            storage::validate_storage,
            storage::import_attachment,
            storage::import_attachment_bytes,
            storage::resolve_managed_attachment,
            storage::register_linked_asset,
            storage::attachment_exists,
            storage::open_attachment_file,
            storage::reveal_attachment_file,
            storage::delete_managed_attachment,
            storage::remove_managed_attachment,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Second Brain");
}
