use std::{
    fs,
    path::{Component, Path, PathBuf},
    process::Command,
};

use serde::Serialize;
use tauri::Manager;
use uuid::Uuid;

const MAX_IMPORT_BYTES: u64 = 25 * 1024 * 1024;

#[derive(Debug, Serialize)]
pub struct StorageStatus {
    pub root: String,
    pub accessible: bool,
    pub attachments_dir: String,
    pub exports_dir: String,
    pub backups_dir: String,
    pub trash_dir: String,
}

#[derive(Debug, Serialize)]
pub struct ImportedAttachment {
    pub id: String,
    pub original_name: String,
    pub stored_name: Option<String>,
    pub mime_type: Option<String>,
    pub size_bytes: u64,
    pub storage_mode: String,
    pub relative_path: Option<String>,
    pub external_path: Option<String>,
}

fn validate_root(root: &Path) -> Result<PathBuf, String> {
    if !root.is_absolute() {
        return Err("Storage path must be absolute".into());
    }
    fs::create_dir_all(root)
        .map_err(|error| format!("Could not access storage folder: {error}"))?;
    root.canonicalize()
        .map_err(|error| format!("Could not resolve storage folder: {error}"))
}

fn ensure_layout(root: &Path) -> Result<StorageStatus, String> {
    let root = validate_root(root)?;
    let attachments = root.join("Attachments");
    let exports = root.join("Exports");
    let backups = root.join("Backups");
    let trash = root.join("Trash");
    for path in [&attachments, &exports, &backups, &trash] {
        fs::create_dir_all(path)
            .map_err(|error| format!("Could not create storage folder: {error}"))?;
    }
    Ok(StorageStatus {
        root: root.to_string_lossy().into_owned(),
        accessible: true,
        attachments_dir: attachments.to_string_lossy().into_owned(),
        exports_dir: exports.to_string_lossy().into_owned(),
        backups_dir: backups.to_string_lossy().into_owned(),
        trash_dir: trash.to_string_lossy().into_owned(),
    })
}

fn relative_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err("Invalid managed attachment path".into());
    }
    let candidate = root.join(path);
    let parent = candidate
        .parent()
        .ok_or("Invalid managed attachment path")?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|_| "Attachment folder is not accessible".to_string())?;
    if !canonical_parent.starts_with(root) {
        return Err("Attachment path is outside storage folder".into());
    }
    if candidate.exists() {
        let canonical_file = candidate
            .canonicalize()
            .map_err(|_| "Attachment file is not accessible".to_string())?;
        if !canonical_file.starts_with(root) {
            return Err("Attachment path is outside storage folder".into());
        }
    }
    Ok(candidate)
}

fn validate_component(value: &str, label: &str) -> Result<(), String> {
    let components: Vec<_> = Path::new(value).components().collect();
    if components.len() != 1 || !matches!(components[0], Component::Normal(_)) {
        return Err(format!("Invalid {label}"));
    }
    Ok(())
}

#[tauri::command]
pub fn validate_storage(app: tauri::AppHandle, root: String) -> Result<StorageStatus, String> {
    let status = ensure_layout(Path::new(&root))?;
    app.asset_protocol_scope()
        .allow_directory(&status.root, true)
        .map_err(|error| format!("Could not allow storage assets: {error}"))?;
    Ok(status)
}

#[tauri::command]
pub fn import_attachment(
    root: String,
    note_id: String,
    source_path: String,
    storage_mode: String,
) -> Result<ImportedAttachment, String> {
    let root = validate_root(Path::new(&root))?;
    validate_component(&note_id, "note id")?;
    let source = Path::new(&source_path);
    if !source.is_file() {
        return Err("Selected file does not exist".into());
    }
    let original_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Selected file has no valid name")?
        .to_string();
    let metadata = fs::metadata(source).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_IMPORT_BYTES {
        return Err("Selected file is too large (maximum 25 MB)".into());
    }
    let id = format!("att-{}", Uuid::new_v4());
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let mime_type = extension.to_ascii_lowercase();

    if storage_mode == "linked" {
        return Ok(ImportedAttachment {
            id,
            original_name,
            stored_name: None,
            mime_type: Some(mime_type),
            size_bytes: metadata.len(),
            storage_mode,
            relative_path: None,
            external_path: Some(
                source
                    .canonicalize()
                    .unwrap_or_else(|_| source.to_path_buf())
                    .to_string_lossy()
                    .into_owned(),
            ),
        });
    }
    if storage_mode != "managed" {
        return Err("Unknown attachment storage mode".into());
    }
    let note_dir = root.join("Attachments").join(&note_id);
    fs::create_dir_all(&note_dir).map_err(|error| error.to_string())?;
    let stored_name = format!("{}.{}", Uuid::new_v4(), extension.to_ascii_lowercase());
    let mut destination = note_dir.join(&stored_name);
    while destination.exists() {
        destination = note_dir.join(format!(
            "{}.{}",
            Uuid::new_v4(),
            extension.to_ascii_lowercase()
        ));
    }
    fs::copy(source, &destination)
        .map_err(|error| format!("Could not copy attachment: {error}"))?;
    Ok(ImportedAttachment {
        id,
        original_name,
        stored_name: Some(stored_name.clone()),
        mime_type: Some(mime_type),
        size_bytes: metadata.len(),
        storage_mode,
        relative_path: Some(format!("Attachments/{note_id}/{stored_name}")),
        external_path: None,
    })
}

#[tauri::command]
pub fn import_attachment_bytes(
    root: String,
    note_id: String,
    file_name: String,
    mime_type: String,
    bytes: Vec<u8>,
) -> Result<ImportedAttachment, String> {
    validate_component(&note_id, "note id")?;
    if bytes.len() as u64 > MAX_IMPORT_BYTES {
        return Err("Selected file is too large (maximum 25 MB)".into());
    }
    let normalized_mime = mime_type.to_ascii_lowercase();
    if !matches!(
        normalized_mime.as_str(),
        "image/png" | "image/jpeg" | "image/jpg" | "image/webp" | "image/gif"
    ) {
        return Err("Only PNG, JPG, JPEG, WEBP, and GIF images can be pasted into a note".into());
    }
    let root = validate_root(Path::new(&root))?;
    let name_path = Path::new(&file_name);
    let original_name = name_path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| *name == file_name)
        .ok_or("Selected file has no valid name")?
        .to_string();
    let extension = name_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_else(|| match normalized_mime.as_str() {
            "image/png" => "png".into(),
            "image/jpeg" | "image/jpg" => "jpg".into(),
            "image/webp" => "webp".into(),
            "image/gif" => "gif".into(),
            _ => "bin".into(),
        });
    let note_dir = root.join("Attachments").join(&note_id);
    fs::create_dir_all(&note_dir).map_err(|error| error.to_string())?;
    let stored_name = format!("{}.{}", Uuid::new_v4(), extension);
    let destination = note_dir.join(&stored_name);
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&destination)
        .map_err(|error| format!("Could not create attachment: {error}"))?;
    std::io::Write::write_all(&mut file, &bytes)
        .map_err(|error| format!("Could not write attachment: {error}"))?;
    Ok(ImportedAttachment {
        id: format!("att-{}", Uuid::new_v4()),
        original_name,
        stored_name: Some(stored_name.clone()),
        mime_type: Some(mime_type),
        size_bytes: bytes.len() as u64,
        storage_mode: "managed".into(),
        relative_path: Some(format!("Attachments/{note_id}/{stored_name}")),
        external_path: None,
    })
}

#[tauri::command]
pub fn resolve_managed_attachment(
    app: tauri::AppHandle,
    root: String,
    relative_path_value: String,
) -> Result<String, String> {
    let root = validate_root(Path::new(&root))?;
    app.asset_protocol_scope()
        .allow_directory(&root, true)
        .map_err(|error| format!("Could not allow storage assets: {error}"))?;
    let path = relative_path(&root, &relative_path_value)?;
    if !path.exists() {
        return Err("Managed attachment file no longer exists".into());
    }
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn register_linked_asset(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let canonical = Path::new(&path)
        .canonicalize()
        .map_err(|_| "Linked attachment file no longer exists".to_string())?;
    if !canonical.is_file() {
        return Err("Linked attachment file no longer exists".into());
    }
    app.asset_protocol_scope()
        .allow_file(&canonical)
        .map_err(|error| format!("Could not allow linked asset: {error}"))?;
    Ok(canonical.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn attachment_exists(path: String) -> bool {
    Path::new(&path).is_file()
}

fn canonical_file(path: &str) -> Result<PathBuf, String> {
    let canonical = Path::new(path)
        .canonicalize()
        .map_err(|_| "Attachment file no longer exists".to_string())?;
    if !canonical.is_file() {
        return Err("Attachment path is not a file".into());
    }
    Ok(canonical)
}

#[cfg(target_os = "windows")]
fn windows_display_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else {
        value.strip_prefix(r"\\?\").unwrap_or(&value).to_string()
    }
}

#[tauri::command]
pub fn open_attachment_file(path: String) -> Result<(), String> {
    let path = canonical_file(&path)?;
    #[cfg(target_os = "windows")]
    Command::new("rundll32.exe")
        .arg("url.dll,FileProtocolHandler")
        .arg(windows_display_path(&path))
        .spawn()
        .map_err(|error| format!("Could not open attachment: {error}"))?;
    #[cfg(target_os = "macos")]
    Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|error| format!("Could not open attachment: {error}"))?;
    #[cfg(all(unix, not(target_os = "macos")))]
    Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(|error| format!("Could not open attachment: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn reveal_attachment_file(path: String) -> Result<(), String> {
    let path = canonical_file(&path)?;
    #[cfg(target_os = "windows")]
    Command::new("explorer.exe")
        .arg(format!("/select,{}", windows_display_path(&path)))
        .spawn()
        .map_err(|error| format!("Could not reveal attachment: {error}"))?;
    #[cfg(target_os = "macos")]
    Command::new("open")
        .args(["-R", &path.to_string_lossy()])
        .spawn()
        .map_err(|error| format!("Could not reveal attachment: {error}"))?;
    #[cfg(all(unix, not(target_os = "macos")))]
    Command::new("xdg-open")
        .arg(path.parent().unwrap_or(Path::new(".")))
        .spawn()
        .map_err(|error| format!("Could not reveal attachment: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_managed_attachment(root: String, relative_path_value: String) -> Result<(), String> {
    let root = validate_root(Path::new(&root))?;
    let path = relative_path(&root, &relative_path_value)?;
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("Could not delete managed attachment: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn remove_managed_attachment(root: String, relative_path_value: String) -> Result<(), String> {
    delete_managed_attachment(root, relative_path_value)
}
