package com.woa.modcreator;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "WoaStorage")
public class WoaStoragePlugin extends Plugin {
    private static final int MAX_READ_BYTES = 150 * 1024 * 1024;
    private static final String ROOT_FOLDER_NAME = "World of Adventure Mod Creator";
    private static final String[] SUBDIRS = new String[]{
        "Projects", "Templates", "Assets", "Exports", "Backups", "Settings"
    };

    private String pendingSaveBase64 = null;

    @PluginMethod
    public void pickDirectory(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        startActivityForResult(call, intent, "handlePickDirectoryResult");
    }

    @ActivityCallback
    private void handlePickDirectoryResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }

        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }

        try {
            int takeFlags = result.getData().getFlags()
                & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (takeFlags == 0) {
                takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            }
            getContext().getContentResolver().takePersistableUriPermission(treeUri, takeFlags);
            ensureSubfoldersInTree(treeUri);

            String label = treeUri.getLastPathSegment();
            if (label == null || label.isEmpty()) {
                label = ROOT_FOLDER_NAME;
            }
            JSObject out = new JSObject();
            out.put("uri", treeUri.toString());
            out.put("label", label);
            out.put("cancelled", false);
            call.resolve(out);
        } catch (Exception ex) {
            call.reject("Failed to initialize selected SAF directory: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void pickFiles(PluginCall call) {
        boolean multiple = Boolean.TRUE.equals(call.getBoolean("multiple", false));
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
        startActivityForResult(call, intent, "handlePickFilesResult");
    }

    @ActivityCallback
    private void handlePickFilesResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject empty = new JSObject();
            empty.put("files", new JSArray());
            call.resolve(empty);
            return;
        }

        Intent data = result.getData();
        List<Uri> uris = new ArrayList<>();
        if (data.getClipData() != null) {
            int count = data.getClipData().getItemCount();
            for (int i = 0; i < count; i++) {
                Uri itemUri = data.getClipData().getItemAt(i).getUri();
                if (itemUri != null) uris.add(itemUri);
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }

        try {
            ContentResolver resolver = getContext().getContentResolver();
            JSArray filesArr = new JSArray();
            for (Uri uri : uris) {
                String name = queryDisplayName(resolver, uri);
                String mime = resolver.getType(uri);
                if (mime == null) mime = "application/octet-stream";

                byte[] bytes = readAllBytesBounded(resolver, uri);
                JSObject item = new JSObject();
                item.put("name", name);
                item.put("mimeType", mime);
                item.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
                filesArr.put(item);
            }
            JSObject out = new JSObject();
            out.put("files", filesArr);
            call.resolve(out);
        } catch (Exception ex) {
            call.reject("Failed to read picked file(s): " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void saveExportDocument(PluginCall call) {
        String fileName = call.getString("fileName", "export.woamod");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String base64 = call.getString("base64");
        if (base64 == null) {
            call.reject("Missing base64 payload for saveExportDocument.");
            return;
        }
        pendingSaveBase64 = base64;

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        startActivityForResult(call, intent, "handleSaveDocumentResult");
    }

    @ActivityCallback
    private void handleSaveDocumentResult(PluginCall call, ActivityResult result) {
        String payload = pendingSaveBase64;
        pendingSaveBase64 = null;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject out = new JSObject();
            out.put("saved", false);
            out.put("cancelled", true);
            call.resolve(out);
            return;
        }
        if (payload == null) {
            call.reject("Missing export payload buffer.");
            return;
        }

        Uri targetUri = result.getData().getData();
        try {
            byte[] bytes = Base64.decode(payload, Base64.DEFAULT);
            ContentResolver resolver = getContext().getContentResolver();
            try (OutputStream os = resolver.openOutputStream(targetUri, "w")) {
                if (os == null) {
                    throw new IllegalStateException("Unable to open output stream for selected URI.");
                }
                os.write(bytes);
                os.flush();
            }
            String label = queryDisplayName(resolver, targetUri);
            JSObject out = new JSObject();
            out.put("saved", true);
            out.put("cancelled", false);
            out.put("uri", targetUri.toString());
            out.put("label", label);
            call.resolve(out);
        } catch (Exception ex) {
            call.reject("Failed to write export document: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void writeFileToTree(PluginCall call) {
        String treeUriStr = call.getString("treeUri");
        String relativePath = call.getString("relativePath");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String base64 = call.getString("base64");

        if (treeUriStr == null || relativePath == null || base64 == null) {
            call.reject("Missing treeUri, relativePath, or base64 argument.");
            return;
        }

        try {
            Uri treeUri = Uri.parse(treeUriStr);
            ContentResolver resolver = getContext().getContentResolver();
            String rootDocId = DocumentsContract.getTreeDocumentId(treeUri);
            Uri rootDocUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, rootDocId);

            Uri woaRootUri = findOrCreateSubdir(resolver, treeUri, rootDocUri, ROOT_FOLDER_NAME);
            String[] segments = relativePath.replace("\\", "/").split("/");
            Uri currentParent = woaRootUri;
            for (int i = 0; i < segments.length - 1; i++) {
                String seg = segments[i].trim();
                if (seg.isEmpty() || ".".equals(seg) || "..".equals(seg)) continue;
                currentParent = findOrCreateSubdir(resolver, treeUri, currentParent, seg);
            }

            String fileName = segments[segments.length - 1].trim();
            if (fileName.isEmpty() || "..".equals(fileName)) {
                call.reject("Unsafe file name.");
                return;
            }

            Uri existingDoc = findChildUri(resolver, treeUri, currentParent, fileName);
            Uri targetFileUri = existingDoc != null
                ? existingDoc
                : DocumentsContract.createDocument(resolver, currentParent, mimeType, fileName);

            if (targetFileUri == null) {
                call.reject("Unable to create SAF document.");
                return;
            }

            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            try (OutputStream os = resolver.openOutputStream(targetFileUri, "wt")) {
                if (os == null) {
                    throw new IllegalStateException("Cannot open SAF output stream.");
                }
                os.write(bytes);
                os.flush();
            }

            JSObject out = new JSObject();
            out.put("saved", true);
            out.put("uri", targetFileUri.toString());
            call.resolve(out);
        } catch (Exception ex) {
            call.reject("Failed writing SAF tree file: " + ex.getMessage(), ex);
        }
    }

    private void ensureSubfoldersInTree(Uri treeUri) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        String rootDocId = DocumentsContract.getTreeDocumentId(treeUri);
        Uri rootDocUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, rootDocId);
        Uri appRoot = findOrCreateSubdir(resolver, treeUri, rootDocUri, ROOT_FOLDER_NAME);
        for (String sub : SUBDIRS) {
            findOrCreateSubdir(resolver, treeUri, appRoot, sub);
        }
    }

    private Uri findOrCreateSubdir(ContentResolver resolver, Uri treeUri, Uri parentDocUri, String dirName) throws Exception {
        Uri existing = findChildUri(resolver, treeUri, parentDocUri, dirName);
        if (existing != null) return existing;
        Uri created = DocumentsContract.createDocument(
            resolver,
            parentDocUri,
            DocumentsContract.Document.MIME_TYPE_DIR,
            dirName
        );
        if (created == null) {
            throw new IllegalStateException("Could not create directory: " + dirName);
        }
        return created;
    }

    private Uri findChildUri(ContentResolver resolver, Uri treeUri, Uri parentDocUri, String displayName) {
        String parentDocId = DocumentsContract.getDocumentId(parentDocUri);
        Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId);
        String[] projection = new String[]{
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME
        };
        try (Cursor cursor = resolver.query(childrenUri, projection, null, null, null)) {
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    String docId = cursor.getString(0);
                    String name = cursor.getString(1);
                    if (displayName.equals(name)) {
                        return DocumentsContract.buildDocumentUriUsingTree(treeUri, docId);
                    }
                }
            }
        } catch (Exception ignored) {
            // Query may return null on empty directories
        }
        return null;
    }

    private String queryDisplayName(ContentResolver resolver, Uri uri) {
        String name = null;
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                name = cursor.getString(0);
            }
        } catch (Exception ignored) {
        }
        if (name == null || name.trim().isEmpty()) {
            String last = uri.getLastPathSegment();
            name = last != null ? last : "imported_file";
        }
        return name;
    }

    private byte[] readAllBytesBounded(ContentResolver resolver, Uri uri) throws Exception {
        try (InputStream is = resolver.openInputStream(uri)) {
            if (is == null) {
                throw new IllegalStateException("Unable to open input stream.");
            }
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            int total = 0;
            int read;
            while ((read = is.read(chunk)) != -1) {
                total += read;
                if (total > MAX_READ_BYTES) {
                    throw new IllegalStateException("Selected file exceeds 150 MB limit.");
                }
                buffer.write(chunk, 0, read);
            }
            return buffer.toByteArray();
        }
    }
}
