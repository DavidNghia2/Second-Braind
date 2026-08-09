use std::path::PathBuf;

use serde::Serialize;
use sqlx::{sqlite::{SqliteConnectOptions, SqliteConnection}, Connection, FromRow, Row, Transaction};
use tauri::{AppHandle, Manager};

#[derive(Serialize, FromRow)]
pub struct OrphanAttachment {
    id: String,
    note_id: String,
    storage_location_id: Option<String>,
    original_name: String,
    stored_name: Option<String>,
    mime_type: Option<String>,
    size_bytes: i64,
    storage_mode: String,
    relative_path: Option<String>,
    external_path: Option<String>,
    display_mode: String,
    caption: Option<String>,
    width_mode: String,
    created_at: String,
    deleted_at: Option<String>,
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir()
        .map(|directory| directory.join("second-brain.db"))
        .map_err(|error| error.to_string())
}

async fn connect(app: &AppHandle) -> Result<SqliteConnection, String> {
    SqliteConnection::connect_with(
        &SqliteConnectOptions::new()
            .filename(database_path(app)?)
            .create_if_missing(false)
            .foreign_keys(true)
            .busy_timeout(std::time::Duration::from_secs(5)),
    )
    .await
    .map_err(|error| error.to_string())
}

fn now() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

#[tauri::command]
pub async fn trash_note(app: AppHandle, id: String) -> Result<(), String> {
    let mut connection = connect(&app).await?;
    let mut transaction = connection.begin().await.map_err(|error| error.to_string())?;
    let timestamp = now();
    let updated = sqlx::query("UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(&timestamp).bind(&timestamp).bind(&id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    if updated.rows_affected() != 1 { return Err("Note not found or is already in Trash".into()); }
    sqlx::query("UPDATE note_attachments SET deleted_at = ? WHERE note_id = ? AND deleted_at IS NULL")
        .bind(timestamp).bind(id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    transaction.commit().await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn restore_note(app: AppHandle, id: String) -> Result<(), String> {
    let mut connection = connect(&app).await?;
    let mut transaction = connection.begin().await.map_err(|error| error.to_string())?;
    let updated = sqlx::query("UPDATE notes SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL")
        .bind(now()).bind(&id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    if updated.rows_affected() != 1 { return Err("Note not found or is not in Trash".into()); }
    sqlx::query("UPDATE note_attachments SET deleted_at = NULL WHERE note_id = ?")
        .bind(id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    transaction.commit().await.map_err(|error| error.to_string())
}

async fn folder_tree_ids(transaction: &mut Transaction<'_, sqlx::Sqlite>, id: &str) -> Result<Vec<String>, String> {
    let rows = sqlx::query("WITH RECURSIVE tree(id) AS (SELECT id FROM folders WHERE id = ? UNION ALL SELECT folders.id FROM folders JOIN tree ON folders.parent_id = tree.id) SELECT id FROM tree")
        .bind(id).fetch_all(&mut **transaction).await.map_err(|error| error.to_string())?;
    let ids = rows.into_iter().map(|row| row.try_get::<String, _>("id")).collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
    if ids.is_empty() { Err("Folder not found".into()) } else { Ok(ids) }
}

async fn folder_restore_ids(transaction: &mut Transaction<'_, sqlx::Sqlite>, id: &str) -> Result<Vec<String>, String> {
    let rows = sqlx::query("WITH RECURSIVE descendants(id) AS (SELECT id FROM folders WHERE id = ? UNION ALL SELECT folders.id FROM folders JOIN descendants ON folders.parent_id = descendants.id), ancestors(id, parent_id) AS (SELECT id, parent_id FROM folders WHERE id = ? UNION ALL SELECT folders.id, folders.parent_id FROM folders JOIN ancestors ON folders.id = ancestors.parent_id) SELECT id FROM descendants UNION SELECT id FROM ancestors")
        .bind(id).bind(id).fetch_all(&mut **transaction).await.map_err(|error| error.to_string())?;
    let ids = rows.into_iter().map(|row| row.try_get::<String, _>("id")).collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
    if ids.is_empty() { Err("Folder not found".into()) } else { Ok(ids) }
}

#[tauri::command]
pub async fn trash_folder_tree(app: AppHandle, id: String) -> Result<(), String> {
    let mut connection = connect(&app).await?;
    let mut transaction = connection.begin().await.map_err(|error| error.to_string())?;
    let ids = folder_tree_ids(&mut transaction, &id).await?;
    let placeholders = std::iter::repeat_n("?", ids.len()).collect::<Vec<_>>().join(",");
    let timestamp = now();
    let folder_sql = format!("UPDATE folders SET deleted_at = ?, updated_at = ? WHERE id IN ({placeholders}) AND deleted_at IS NULL");
    let mut folder_query = sqlx::query(&folder_sql);
    folder_query = folder_query.bind(&timestamp).bind(&timestamp);
    for folder_id in &ids { folder_query = folder_query.bind(folder_id); }
    folder_query.execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    let note_sql = format!("UPDATE notes SET deleted_at = ?, updated_at = ? WHERE folder_id IN ({placeholders}) AND deleted_at IS NULL");
    let mut note_query = sqlx::query(&note_sql);
    note_query = note_query.bind(&timestamp).bind(&timestamp);
    for folder_id in &ids { note_query = note_query.bind(folder_id); }
    note_query.execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    let attachment_sql = format!("UPDATE note_attachments SET deleted_at = ? WHERE note_id IN (SELECT id FROM notes WHERE folder_id IN ({placeholders})) AND deleted_at IS NULL");
    let mut attachment_query = sqlx::query(&attachment_sql);
    attachment_query = attachment_query.bind(timestamp);
    for folder_id in &ids { attachment_query = attachment_query.bind(folder_id); }
    attachment_query.execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    transaction.commit().await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn restore_folder_tree(app: AppHandle, id: String) -> Result<(), String> {
    let mut connection = connect(&app).await?;
    let mut transaction = connection.begin().await.map_err(|error| error.to_string())?;
    let deleted_at = sqlx::query("SELECT deleted_at FROM folders WHERE id = ?")
        .bind(&id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?
        .and_then(|row| row.try_get::<Option<String>, _>("deleted_at").ok().flatten())
        .ok_or_else(|| "Folder not found or is not in Trash".to_string())?;
    let tree_ids = folder_tree_ids(&mut transaction, &id).await?;
    let restore_ids = folder_restore_ids(&mut transaction, &id).await?;
    let tree_placeholders = std::iter::repeat_n("?", tree_ids.len()).collect::<Vec<_>>().join(",");
    let restore_placeholders = std::iter::repeat_n("?", restore_ids.len()).collect::<Vec<_>>().join(",");
    let note_select_sql = format!("SELECT id FROM notes WHERE folder_id IN ({tree_placeholders}) AND deleted_at = ?");
    let mut note_select_query = sqlx::query(&note_select_sql);
    for folder_id in &tree_ids { note_select_query = note_select_query.bind(folder_id); }
    note_select_query = note_select_query.bind(&deleted_at);
    let note_ids = note_select_query.fetch_all(&mut *transaction).await.map_err(|error| error.to_string())?
        .into_iter().map(|row| row.try_get::<String, _>("id")).collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
    let folder_sql = format!("UPDATE folders SET deleted_at = NULL, updated_at = ? WHERE id IN ({restore_placeholders}) AND deleted_at = ?");
    let mut folder_query = sqlx::query(&folder_sql);
    folder_query = folder_query.bind(now());
    for folder_id in &restore_ids { folder_query = folder_query.bind(folder_id); }
    folder_query = folder_query.bind(&deleted_at);
    folder_query.execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    if !note_ids.is_empty() {
        let note_placeholders = std::iter::repeat_n("?", note_ids.len()).collect::<Vec<_>>().join(",");
        let note_sql = format!("UPDATE notes SET deleted_at = NULL, updated_at = ? WHERE id IN ({note_placeholders}) AND deleted_at = ?");
        let mut note_query = sqlx::query(&note_sql).bind(now());
        for note_id in &note_ids { note_query = note_query.bind(note_id); }
        note_query = note_query.bind(&deleted_at);
        note_query.execute(&mut *transaction).await.map_err(|error| error.to_string())?;
        let attachment_sql = format!("UPDATE note_attachments SET deleted_at = NULL WHERE note_id IN ({note_placeholders}) AND deleted_at = ?");
        let mut attachment_query = sqlx::query(&attachment_sql);
        for note_id in &note_ids { attachment_query = attachment_query.bind(note_id); }
        attachment_query = attachment_query.bind(&deleted_at);
        attachment_query.execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    }
    transaction.commit().await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn permanently_delete_note(app: AppHandle, id: String) -> Result<Vec<OrphanAttachment>, String> {
    let mut connection = connect(&app).await?;
    let mut transaction = connection.begin().await.map_err(|error| error.to_string())?;
    let attachments = sqlx::query_as::<_, OrphanAttachment>("SELECT a.id, a.note_id, a.storage_location_id, a.original_name, a.stored_name, a.mime_type, a.size_bytes, a.storage_mode, a.relative_path, a.external_path, a.display_mode, a.caption, a.width_mode, a.created_at, a.deleted_at FROM attachments a JOIN note_attachments na ON na.attachment_id = a.id WHERE na.note_id = ?")
        .bind(&id).fetch_all(&mut *transaction).await.map_err(|error| error.to_string())?;
    sqlx::query("DELETE FROM note_attachments WHERE note_id = ?").bind(&id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    sqlx::query("DELETE FROM link_previews WHERE note_id = ?").bind(&id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    let deleted = sqlx::query("DELETE FROM notes WHERE id = ? AND deleted_at IS NOT NULL").bind(&id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    if deleted.rows_affected() != 1 { return Err("Note not found or is not in Trash".into()); }
    let mut orphaned = Vec::new();
    for attachment in attachments {
        let references: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM note_attachments WHERE attachment_id = ?")
            .bind(&attachment.id).fetch_one(&mut *transaction).await.map_err(|error| error.to_string())?;
        if references == 0 {
            sqlx::query("DELETE FROM attachments WHERE id = ?").bind(&attachment.id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
            orphaned.push(attachment);
        }
    }
    transaction.commit().await.map_err(|error| error.to_string())?;
    Ok(orphaned)
}

#[tauri::command]
pub async fn permanently_delete_folder_tree(app: AppHandle, id: String) -> Result<Vec<OrphanAttachment>, String> {
    let mut connection = connect(&app).await?;
    let mut transaction = connection.begin().await.map_err(|error| error.to_string())?;
    let folder_ids = folder_tree_ids(&mut transaction, &id).await?;
    let placeholders = std::iter::repeat_n("?", folder_ids.len()).collect::<Vec<_>>().join(",");
    let note_sql = format!("SELECT id FROM notes WHERE folder_id IN ({placeholders}) AND deleted_at IS NOT NULL");
    let mut note_query = sqlx::query(&note_sql);
    for folder_id in &folder_ids { note_query = note_query.bind(folder_id); }
    let note_ids = note_query.fetch_all(&mut *transaction).await.map_err(|error| error.to_string())?
        .into_iter().map(|row| row.try_get::<String, _>("id")).collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
    let mut attachments = Vec::new();
    for note_id in &note_ids {
        attachments.extend(sqlx::query_as::<_, OrphanAttachment>("SELECT a.id, a.note_id, a.storage_location_id, a.original_name, a.stored_name, a.mime_type, a.size_bytes, a.storage_mode, a.relative_path, a.external_path, a.display_mode, a.caption, a.width_mode, a.created_at, a.deleted_at FROM attachments a JOIN note_attachments na ON na.attachment_id = a.id WHERE na.note_id = ?")
            .bind(note_id).fetch_all(&mut *transaction).await.map_err(|error| error.to_string())?);
        sqlx::query("DELETE FROM note_attachments WHERE note_id = ?").bind(note_id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
        sqlx::query("DELETE FROM link_previews WHERE note_id = ?").bind(note_id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    }
    for note_id in &note_ids {
        sqlx::query("DELETE FROM notes WHERE id = ? AND deleted_at IS NOT NULL").bind(note_id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    }
    let folder_sql = format!("DELETE FROM folders WHERE id IN ({placeholders}) AND deleted_at IS NOT NULL");
    let mut folder_query = sqlx::query(&folder_sql);
    for folder_id in &folder_ids { folder_query = folder_query.bind(folder_id); }
    folder_query.execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    let mut orphaned = Vec::new();
    for attachment in attachments {
        let references: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM note_attachments WHERE attachment_id = ?").bind(&attachment.id).fetch_one(&mut *transaction).await.map_err(|error| error.to_string())?;
        if references == 0 {
            sqlx::query("DELETE FROM attachments WHERE id = ?").bind(&attachment.id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
            orphaned.push(attachment);
        }
    }
    transaction.commit().await.map_err(|error| error.to_string())?;
    Ok(orphaned)
}
