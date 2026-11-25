package com.woa.modcreator;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(
    name = "WoaStorage",
    permissions = {
        @Permission(
            alias = "legacyStorageRead",
            strings = { Manifest.permission.READ_EXTERNAL_STORAGE }
        ),
        @Permission(
            alias = "legacyStorageWrite",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            }
        )
    }
)
public class WoaStoragePlugin extends Plugin {
    private static final int MAX_READ_BYTES = 150 * 1024 * 1024;
    private static final String ROOT_FOLDER_NAME = "World of Adventure Mod Creator";
    private static final String PREFS_NAME = "woa_android_storage_prefs";
    private static final String PREF_SAF_TREE_URI = "saf_tree_uri";
    private static final String PREF_SAF_TREE_LABEL = "saf_tree_label";
    private static final String PREF_SAF_REVOKED = "saf_tree_revoked";
    private static final String PREF_ASKED_LEGACY_READ = "asked_legacy_read";
    private static final String PREF_ASKED_LEGACY_WRITE = "asked_legacy_write";
    private static final String TEMP_SUFFIX = ".woatmp";
    private static final String[] SUBDIRS = new String[]{
        "Projects", "Exports", "Backups", "Assets", "Settings", "Templates"
    };

    private String pendingSaveBase64 = null;

    private SharedPreferences getPrefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private boolean isUriPersisted(Uri targetUri, boolean requireWrite) {
        if (targetUri == null) return false;
        ContentResolver resolver = getContext().getContentResolver();
        List<UriPermission> perms = resolver.getPersistedUriPermissions();
        for (UriPermission perm : perms) {
            if (targetUri.equals(perm.getUri())) {
                if (requireWrite) {
                    return perm.isReadPermission() && perm.isWritePermission();
                }
                return perm.isReadPermission();
            }
        }
        return false;
    }

    private boolean hasLegacyReadPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return true;
        }
        return ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.READ_EXTERNAL_STORAGE
        ) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasLegacyWritePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return true;
        }
        return ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.WRITE_EXTERNAL_STORAGE
        ) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean isLegacyPermissionPermanentlyDenied(String permission, String askedPrefKey) {
        Activity activity = getActivity();
        if (activity == null) return false;
        if (ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        boolean askedBefore = getPrefs().getBoolean(askedPrefKey, false);
        return askedBefore && !ActivityCompat.shouldShowRequestPermissionRationale(activity, permission);
    }

    private boolean verifyLiveTreeAccess(Uri treeUri) {
        if (!isUriPersisted(treeUri, true)) {
            return false;
        }
        try {
            ContentResolver resolver = getContext().getContentResolver();
            String rootDocId = DocumentsContract.getTreeDocumentId(treeUri);
            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, rootDocId);
            String[] projection = new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID};
            try (Cursor cursor = resolver.query(childrenUri, projection, null, null, null)) {
                return cursor != null;
            }
        } catch (Exception ignored) {
            return false;
        }
    }

    private JSObject buildAccessStatusPayload() {
        int sdkInt = Build.VERSION.SDK_INT;
        SharedPreferences prefs = getPrefs();
        String savedTreeStr = prefs.getString(PREF_SAF_TREE_URI, null);
        String savedTreeLabel = prefs.getString(PREF_SAF_TREE_LABEL, null);
        boolean safTreeRevoked = prefs.getBoolean(PREF_SAF_REVOKED, false);
        boolean safTreePersisted = false;

        if (savedTreeStr != null && !savedTreeStr.isEmpty()) {
            try {
                Uri treeUri = Uri.parse(savedTreeStr);
                safTreePersisted = verifyLiveTreeAccess(treeUri);
                if (!safTreePersisted) {
                    // Permission was revoked in Android settings or target folder deleted/unmounted
                    prefs.edit()
                        .remove(PREF_SAF_TREE_URI)
                        .putBoolean(PREF_SAF_REVOKED, true)
                        .apply();
                    savedTreeStr = null;
                    safTreeRevoked = true;
                } else if (safTreeRevoked) {
                    prefs.edit().putBoolean(PREF_SAF_REVOKED, false).apply();
                    safTreeRevoked = false;
                }
            } catch (Exception ignored) {
                savedTreeStr = null;
                safTreePersisted = false;
                safTreeRevoked = true;
            }
        }

        int persistedFilesCount = 0;
        try {
            for (UriPermission perm : getContext().getContentResolver().getPersistedUriPermissions()) {
                if (perm.isReadPermission() && !DocumentsContract.isTreeUri(perm.getUri())) {
                    persistedFilesCount++;
                }
            }
        } catch (Exception ignored) {
        }

        boolean legacyReadPermanentlyDenied = sdkInt < Build.VERSION_CODES.TIRAMISU
            && isLegacyPermissionPermanentlyDenied(Manifest.permission.READ_EXTERNAL_STORAGE, PREF_ASKED_LEGACY_READ);
        boolean legacyWritePermanentlyDenied = sdkInt < Build.VERSION_CODES.R
            && isLegacyPermissionPermanentlyDenied(Manifest.permission.WRITE_EXTERNAL_STORAGE, PREF_ASKED_LEGACY_WRITE);

        JSObject out = new JSObject();
        out.put("sdkInt", sdkInt);
        out.put("release", Build.VERSION.RELEASE);
        out.put("usesScopedStorage", sdkInt >= Build.VERSION_CODES.Q);
        out.put("isAndroid13Plus", sdkInt >= Build.VERSION_CODES.TIRAMISU);
        out.put("requiresLegacyStoragePermission", sdkInt < Build.VERSION_CODES.Q);
        out.put("legacyReadGranted", hasLegacyReadPermission());
        out.put("legacyWriteGranted", hasLegacyWritePermission());
        out.put("legacyReadPermanentlyDenied", legacyReadPermanentlyDenied);
        out.put("legacyWritePermanentlyDenied", legacyWritePermanentlyDenied);
        out.put("safTreeUri", savedTreeStr);
        out.put("safTreeLabel", savedTreeLabel);
        out.put("safTreePersisted", safTreePersisted);
        out.put("safTreeAccessValid", safTreePersisted);
        out.put("safTreeRevoked", safTreeRevoked);
        out.put("persistedFilesCount", persistedFilesCount);
        out.put("appFilesDir", getContext().getFilesDir().getAbsolutePath());
        return out;
    }

    @PluginMethod
    public void getStorageAccessStatus(PluginCall call) {
        call.resolve(buildAccessStatusPayload());
    }

    @PluginMethod
    public void checkDirectoryAccess(PluginCall call) {
        boolean ensureStructure = Boolean.TRUE.equals(call.getBoolean("ensureStructure", false));
        JSObject status = buildAccessStatusPayload();
        String activeTree = status.getString("safTreeUri");
        if (ensureStructure && activeTree != null && !activeTree.isEmpty()) {
            try {
                ensureSubfoldersInTree(Uri.parse(activeTree));
            } catch (SecurityException secEx) {
                getPrefs().edit().remove(PREF_SAF_TREE_URI).putBoolean(PREF_SAF_REVOKED, true).apply();
                status = buildAccessStatusPayload();
            } catch (Exception ignored) {
                // Re-query status after structure attempt
                status = buildAccessStatusPayload();
            }
        }
        call.resolve(status);
    }

    @PluginMethod
    public void ensureAppFolderStructure(PluginCall call) {
        String explicitTree = call.getString("treeUri");
        String treeStr = explicitTree != null && !explicitTree.trim().isEmpty()
            ? explicitTree
            : getPrefs().getString(PREF_SAF_TREE_URI, null);
        if (treeStr == null || treeStr.trim().isEmpty()) {
            call.reject("DIRECTORY_INIT_FAILED: No persisted SAF folder selected.");
            return;
        }
        try {
            ensureSubfoldersInTree(Uri.parse(treeStr));
            call.resolve(buildAccessStatusPayload());
        } catch (SecurityException secEx) {
            getPrefs().edit().remove(PREF_SAF_TREE_URI).putBoolean(PREF_SAF_REVOKED, true).apply();
            call.reject("ACCESS_DENIED: Folder permission was revoked: " + secEx.getMessage(), secEx);
        } catch (Exception ex) {
            call.reject("DIRECTORY_INIT_FAILED: Unable to create app folder structure: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void requestOperationAccess(PluginCall call) {
        String operation = call.getString("operation", "app-storage");
        boolean requireLegacyExternal = Boolean.TRUE.equals(call.getBoolean("requireLegacyExternal", false));
        int sdkInt = Build.VERSION.SDK_INT;

        // Modern Android (API 29+) and all SAF/app-private storage operations require zero runtime storage permissions.
        if (!requireLegacyExternal || sdkInt >= Build.VERSION_CODES.Q) {
            JSObject out = buildAccessStatusPayload();
            out.put("granted", true);
            out.put("requiresPermission", false);
            out.put("permanentlyDenied", false);
            out.put("mechanism", "app-storage".equals(operation) || "save-project".equals(operation) || "open-project".equals(operation)
                ? "app-private"
                : "saf");
            call.resolve(out);
            return;
        }

        // Legacy Android <= 9 (API <= 28) direct shared external storage fallback only when explicitly needed
        boolean needsWrite = "export-mod".equals(operation)
            || "backup-export".equals(operation)
            || "pick-directory".equals(operation);

        if (needsWrite) {
            if (hasLegacyReadPermission() && hasLegacyWritePermission()) {
                JSObject out = buildAccessStatusPayload();
                out.put("granted", true);
                out.put("requiresPermission", true);
                out.put("permanentlyDenied", false);
                out.put("mechanism", "legacy-runtime");
                call.resolve(out);
                return;
            }
            getPrefs().edit()
                .putBoolean(PREF_ASKED_LEGACY_READ, true)
                .putBoolean(PREF_ASKED_LEGACY_WRITE, true)
                .apply();
            requestPermissionForAlias("legacyStorageWrite", call, "handleLegacyWritePermissionResult");
        } else {
            if (hasLegacyReadPermission()) {
                JSObject out = buildAccessStatusPayload();
                out.put("granted", true);
                out.put("requiresPermission", true);
                out.put("permanentlyDenied", false);
                out.put("mechanism", "legacy-runtime");
                call.resolve(out);
                return;
            }
            getPrefs().edit().putBoolean(PREF_ASKED_LEGACY_READ, true).apply();
            requestPermissionForAlias("legacyStorageRead", call, "handleLegacyReadPermissionResult");
        }
    }

    @PermissionCallback
    private void handleLegacyReadPermissionResult(PluginCall call) {
        if (call == null) return;
        boolean granted = getPermissionState("legacyStorageRead") == PermissionState.GRANTED
            || hasLegacyReadPermission();
        JSObject out = buildAccessStatusPayload();
        out.put("granted", granted);
        out.put("requiresPermission", true);
        out.put(
            "permanentlyDenied",
            !granted && isLegacyPermissionPermanentlyDenied(
                Manifest.permission.READ_EXTERNAL_STORAGE,
                PREF_ASKED_LEGACY_READ
            )
        );
        out.put("mechanism", "legacy-runtime");
        call.resolve(out);
    }

    @PermissionCallback
    private void handleLegacyWritePermissionResult(PluginCall call) {
        if (call == null) return;
        boolean granted = getPermissionState("legacyStorageWrite") == PermissionState.GRANTED
            || (hasLegacyReadPermission() && hasLegacyWritePermission());
        JSObject out = buildAccessStatusPayload();
        out.put("granted", granted);
        out.put("requiresPermission", true);
        out.put(
            "permanentlyDenied",
            !granted && (
                isLegacyPermissionPermanentlyDenied(Manifest.permission.WRITE_EXTERNAL_STORAGE, PREF_ASKED_LEGACY_WRITE)
                || isLegacyPermissionPermanentlyDenied(Manifest.permission.READ_EXTERNAL_STORAGE, PREF_ASKED_LEGACY_READ)
            )
        );
        out.put("mechanism", "legacy-runtime");
        call.resolve(out);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
            intent.setData(uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject out = new JSObject();
            out.put("opened", true);
            call.resolve(out);
        } catch (Exception ex) {
            call.reject("SETTINGS_OPEN_FAILED: Unable to open Android App Settings: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void pickDirectory(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        try {
            startActivityForResult(call, intent, "handlePickDirectoryResult");
        } catch (ActivityNotFoundException ex) {
            call.reject("PICKER_UNAVAILABLE: Android system folder picker is unavailable on this device.", ex);
        }
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
            getPrefs().edit()
                .putString(PREF_SAF_TREE_URI, treeUri.toString())
                .putString(PREF_SAF_TREE_LABEL, label)
                .putBoolean(PREF_SAF_REVOKED, false)
                .apply();

            JSObject out = new JSObject();
            out.put("uri", treeUri.toString());
            out.put("label", label);
            out.put("persisted", isUriPersisted(treeUri, false));
            out.put("cancelled", false);
            call.resolve(out);
        } catch (SecurityException secEx) {
            call.reject("ACCESS_DENIED: Directory access was denied by Android: " + secEx.getMessage(), secEx);
        } catch (Exception ex) {
            call.reject("DIRECTORY_INIT_FAILED: Failed to initialize selected SAF directory: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void clearPersistedDirectory(PluginCall call) {
        SharedPreferences prefs = getPrefs();
        String savedTreeStr = prefs.getString(PREF_SAF_TREE_URI, null);
        if (savedTreeStr != null && !savedTreeStr.isEmpty()) {
            try {
                Uri treeUri = Uri.parse(savedTreeStr);
                getContext().getContentResolver().releasePersistableUriPermission(
                    treeUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                );
            } catch (Exception ignored) {
            }
        }
        prefs.edit()
            .remove(PREF_SAF_TREE_URI)
            .remove(PREF_SAF_TREE_LABEL)
            .putBoolean(PREF_SAF_REVOKED, false)
            .apply();
        JSObject out = new JSObject();
        out.put("cleared", true);
        call.resolve(out);
    }

    @PluginMethod
    public void pickFiles(PluginCall call) {
        boolean multiple = Boolean.TRUE.equals(call.getBoolean("multiple", false));
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);

        try {
            startActivityForResult(call, intent, "handlePickFilesResult");
        } catch (ActivityNotFoundException ex) {
            // Fallback to ACTION_GET_CONTENT on rare stripped-down Android builds
            Intent fallbackIntent = new Intent(Intent.ACTION_GET_CONTENT);
            fallbackIntent.addCategory(Intent.CATEGORY_OPENABLE);
            fallbackIntent.setType("*/*");
            fallbackIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            fallbackIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
            try {
                startActivityForResult(call, fallbackIntent, "handlePickFilesResult");
            } catch (ActivityNotFoundException fallbackEx) {
                call.reject("PICKER_UNAVAILABLE: No Android file picker is available on this device.", fallbackEx);
            }
        }
    }

    @ActivityCallback
    private void handlePickFilesResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            JSObject empty = new JSObject();
            empty.put("cancelled", true);
            empty.put("files", new JSArray());
            call.resolve(empty);
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("ACCESS_DENIED: File selection did not grant access.");
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

        if (uris.isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("cancelled", true);
            empty.put("files", new JSArray());
            call.resolve(empty);
            return;
        }

        try {
            ContentResolver resolver = getContext().getContentResolver();
            JSArray filesArr = new JSArray();
            for (Uri uri : uris) {
                boolean persisted = false;
                try {
                    int flags = data.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
                    if (flags == 0) flags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
                    resolver.takePersistableUriPermission(uri, flags);
                    persisted = true;
                } catch (Exception ignored) {
                    // Some DocumentProviders issue temporary-only grants; reading now still succeeds cleanly.
                }

                String name = queryDisplayName(resolver, uri);
                String mime = resolver.getType(uri);
                if (mime == null) mime = "application/octet-stream";

                byte[] bytes = readAllBytesBounded(resolver, uri);
                JSObject item = new JSObject();
                item.put("name", name);
                item.put("mimeType", mime);
                item.put("uri", uri.toString());
                item.put("persisted", persisted);
                item.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
                filesArr.put(item);
            }
            JSObject out = new JSObject();
            out.put("cancelled", false);
            out.put("files", filesArr);
            call.resolve(out);
        } catch (SecurityException secEx) {
            call.reject("ACCESS_DENIED: File access was denied: " + secEx.getMessage(), secEx);
        } catch (Exception ex) {
            call.reject("READ_FAILED: Failed to read selected file(s): " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void readDocumentUri(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null || uriStr.trim().isEmpty()) {
            call.reject("READ_FAILED: Missing document URI.");
            return;
        }
        try {
            Uri uri = Uri.parse(uriStr);
            ContentResolver resolver = getContext().getContentResolver();
            String name = queryDisplayName(resolver, uri);
            String mime = resolver.getType(uri);
            if (mime == null) mime = "application/octet-stream";
            byte[] bytes = readAllBytesBounded(resolver, uri);
            JSObject out = new JSObject();
            out.put("name", name);
            out.put("mimeType", mime);
            out.put("uri", uri.toString());
            out.put("persisted", isUriPersisted(uri, false));
            out.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
            call.resolve(out);
        } catch (SecurityException secEx) {
            call.reject("ACCESS_DENIED: File access was denied: " + secEx.getMessage(), secEx);
        } catch (Exception ex) {
            call.reject("READ_FAILED: Unable to read selected document URI: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void saveExportDocument(PluginCall call) {
        String fileName = call.getString("fileName", "export.woamod");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String base64 = call.getString("base64");
        if (base64 == null) {
            call.reject("WRITE_FAILED: Missing payload for saveExportDocument.");
            return;
        }
        pendingSaveBase64 = base64;

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        try {
            startActivityForResult(call, intent, "handleSaveDocumentResult");
        } catch (ActivityNotFoundException ex) {
            pendingSaveBase64 = null;
            call.reject("PICKER_UNAVAILABLE: Android document creator is unavailable on this device.", ex);
        }
    }

    @ActivityCallback
    private void handleSaveDocumentResult(PluginCall call, ActivityResult result) {
        String payload = pendingSaveBase64;
        pendingSaveBase64 = null;
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            JSObject out = new JSObject();
            out.put("saved", false);
            out.put("cancelled", true);
            call.resolve(out);
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("ACCESS_DENIED: Destination file creation was denied.");
            return;
        }
        if (payload == null) {
            call.reject("WRITE_FAILED: Missing export payload buffer.");
            return;
        }

        Uri targetUri = result.getData().getData();
        try {
            byte[] bytes = Base64.decode(payload, Base64.DEFAULT);
            ContentResolver resolver = getContext().getContentResolver();
            try {
                resolver.takePersistableUriPermission(
                    targetUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                );
            } catch (Exception ignored) {
                // Provider may not allow persistable grants on newly created files
            }

            OutputStream os;
            try {
                os = resolver.openOutputStream(targetUri, "wt");
            } catch (Exception modeFallback) {
                os = resolver.openOutputStream(targetUri, "w");
            }
            try (OutputStream outStream = os) {
                if (outStream == null) {
                    throw new IllegalStateException("Unable to open output stream for selected URI.");
                }
                outStream.write(bytes);
                outStream.flush();
            }
            String label = queryDisplayName(resolver, targetUri);
            JSObject out = new JSObject();
            out.put("saved", true);
            out.put("cancelled", false);
            out.put("uri", targetUri.toString());
            out.put("label", label);
            call.resolve(out);
        } catch (SecurityException secEx) {
            call.reject("ACCESS_DENIED: Destination write access was denied: " + secEx.getMessage(), secEx);
        } catch (Exception ex) {
            call.reject("WRITE_FAILED: Failed to write export document: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void writeFileToTree(PluginCall call) {
        String treeUriStr = call.getString("treeUri");
        String relativePath = call.getString("relativePath");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String base64 = call.getString("base64");
        boolean overwrite = !Boolean.FALSE.equals(call.getBoolean("overwrite", true));

        if (treeUriStr == null || relativePath == null || base64 == null) {
            call.reject("WRITE_FAILED: Missing treeUri, relativePath, or base64 argument.");
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
                if (seg.isEmpty() || ".".equals(seg)) continue;
                if ("..".equals(seg)) {
                    call.reject("WRITE_FAILED: Unsafe directory traversal segment.");
                    return;
                }
                currentParent = findOrCreateSubdir(resolver, treeUri, currentParent, seg);
            }

            String fileName = segments[segments.length - 1].trim();
            if (fileName.isEmpty() || ".".equals(fileName) || "..".equals(fileName)) {
                call.reject("WRITE_FAILED: Unsafe file name.");
                return;
            }

            Uri existingDoc = findChildUri(resolver, treeUri, currentParent, fileName);
            if (!overwrite && existingDoc != null) {
                JSObject conflictOut = new JSObject();
                conflictOut.put("saved", false);
                conflictOut.put("exists", true);
                conflictOut.put("uri", existingDoc.toString());
                call.resolve(conflictOut);
                return;
            }

            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            Uri targetFileUri = atomicWriteToParent(resolver, treeUri, currentParent, fileName, mimeType, bytes, existingDoc);

            JSObject out = new JSObject();
            out.put("saved", true);
            out.put("exists", false);
            out.put("uri", targetFileUri.toString());
            call.resolve(out);
        } catch (SecurityException secEx) {
            getPrefs().edit().remove(PREF_SAF_TREE_URI).putBoolean(PREF_SAF_REVOKED, true).apply();
            call.reject("ACCESS_DENIED: SAF directory write access was denied: " + secEx.getMessage(), secEx);
        } catch (Exception ex) {
            call.reject("WRITE_FAILED: Failed writing SAF tree file: " + ex.getMessage(), ex);
        }
    }

    private Uri atomicWriteToParent(
        ContentResolver resolver,
        Uri treeUri,
        Uri currentParent,
        String fileName,
        String mimeType,
        byte[] bytes,
        Uri existingDoc
    ) throws Exception {
        String tempName = ".tmp_" + System.currentTimeMillis() + "_" + fileName.replace("/", "_") + TEMP_SUFFIX;
        Uri tempUri = DocumentsContract.createDocument(resolver, currentParent, mimeType, tempName);
        if (tempUri == null) {
            throw new IllegalStateException("Unable to allocate temporary SAF document.");
        }

        Uri backupUri = null;
        try {
            writeBytesToUri(resolver, tempUri, bytes);

            if (existingDoc == null) {
                try {
                    Uri renamed = DocumentsContract.renameDocument(resolver, tempUri, fileName);
                    if (renamed != null) {
                        tempUri = null;
                        return renamed;
                    }
                } catch (Exception ignored) {
                    // Fallback to direct creation after staging temp succeeded
                }
                Uri direct = DocumentsContract.createDocument(resolver, currentParent, mimeType, fileName);
                if (direct == null) {
                    throw new IllegalStateException("Unable to create SAF target document.");
                }
                writeBytesToUri(resolver, direct, bytes);
                return direct;
            } else {
                // Swap safely: try backup rename + promote temp; fallback to verified overwrite of existingDoc
                try {
                    String backupName = ".bak_" + System.currentTimeMillis() + "_" + fileName + TEMP_SUFFIX;
                    backupUri = DocumentsContract.renameDocument(resolver, existingDoc, backupName);
                    if (backupUri != null) {
                        Uri promoted = DocumentsContract.renameDocument(resolver, tempUri, fileName);
                        if (promoted != null) {
                            tempUri = null;
                            try {
                                DocumentsContract.deleteDocument(resolver, backupUri);
                                backupUri = null;
                            } catch (Exception ignored) {
                            }
                            return promoted;
                        }
                    }
                } catch (Exception ignored) {
                    // Restore existing name if backup rename succeeded before promotion failed
                    if (backupUri != null) {
                        try {
                            existingDoc = DocumentsContract.renameDocument(resolver, backupUri, fileName);
                            backupUri = null;
                        } catch (Exception ignoredRestore) {
                        }
                    }
                }

                writeBytesToUri(resolver, existingDoc, bytes);
                return existingDoc;
            }
        } finally {
            if (tempUri != null) {
                try {
                    DocumentsContract.deleteDocument(resolver, tempUri);
                } catch (Exception ignored) {
                }
            }
            if (backupUri != null) {
                try {
                    DocumentsContract.deleteDocument(resolver, backupUri);
                } catch (Exception ignored) {
                }
            }
        }
    }

    private void writeBytesToUri(ContentResolver resolver, Uri uri, byte[] bytes) throws Exception {
        OutputStream os;
        try {
            os = resolver.openOutputStream(uri, "wt");
        } catch (Exception modeFallback) {
            os = resolver.openOutputStream(uri, "w");
        }
        try (OutputStream outStream = os) {
            if (outStream == null) {
                throw new IllegalStateException("Cannot open SAF output stream.");
            }
            outStream.write(bytes);
            outStream.flush();
        }
    }

    private Uri resolveTreePath(ContentResolver resolver, Uri treeUri, String relativePath) {
        String rootDocId = DocumentsContract.getTreeDocumentId(treeUri);
        Uri currentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, rootDocId);
        Uri woaRootUri = findChildUri(resolver, treeUri, currentUri, ROOT_FOLDER_NAME);
        if (woaRootUri == null) return null;
        currentUri = woaRootUri;
        if (relativePath == null || relativePath.trim().isEmpty()) {
            return currentUri;
        }
        for (String rawSeg : relativePath.replace("\\", "/").split("/")) {
            String seg = rawSeg.trim();
            if (seg.isEmpty() || ".".equals(seg)) continue;
            if ("..".equals(seg)) return null;
            currentUri = findChildUri(resolver, treeUri, currentUri, seg);
            if (currentUri == null) return null;
        }
        return currentUri;
    }

    @PluginMethod
    public void readTreeFile(PluginCall call) {
        String treeUriStr = call.getString("treeUri");
        String relativePath = call.getString("relativePath");
        if (treeUriStr == null || relativePath == null || relativePath.trim().isEmpty()) {
            call.reject("READ_FAILED: Missing treeUri or relativePath argument.");
            return;
        }
        try {
            Uri treeUri = Uri.parse(treeUriStr);
            ContentResolver resolver = getContext().getContentResolver();
            Uri targetUri = resolveTreePath(resolver, treeUri, relativePath);
            if (targetUri == null) {
                JSObject missing = new JSObject();
                missing.put("exists", false);
                call.resolve(missing);
                return;
            }
            String name = queryDisplayName(resolver, targetUri);
            String mime = resolver.getType(targetUri);
            if (mime == null) mime = "application/octet-stream";
            byte[] bytes = readAllBytesBounded(resolver, targetUri);
            JSObject out = new JSObject();
            out.put("exists", true);
            out.put("name", name);
            out.put("mimeType", mime);
            out.put("uri", targetUri.toString());
            out.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
            call.resolve(out);
        } catch (SecurityException secEx) {
            getPrefs().edit().remove(PREF_SAF_TREE_URI).putBoolean(PREF_SAF_REVOKED, true).apply();
            call.reject("ACCESS_DENIED: Unable to read SAF file: " + secEx.getMessage(), secEx);
        } catch (Exception ex) {
            call.reject("READ_FAILED: Failed reading SAF file: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void treeEntryExists(PluginCall call) {
        String treeUriStr = call.getString("treeUri");
        String relativePath = call.getString("relativePath");
        if (treeUriStr == null || relativePath == null || relativePath.trim().isEmpty()) {
            call.reject("READ_FAILED: Missing treeUri or relativePath argument.");
            return;
        }
        try {
            Uri treeUri = Uri.parse(treeUriStr);
            ContentResolver resolver = getContext().getContentResolver();
            Uri targetUri = resolveTreePath(resolver, treeUri, relativePath);
            if (targetUri == null) {
                JSObject missing = new JSObject();
                missing.put("exists", false);
                call.resolve(missing);
                return;
            }
            JSObject out = new JSObject();
            out.put("exists", true);
            out.put("uri", targetUri.toString());
            String mime = null;
            long sizeBytes = 0;
            long lastModified = 0;
            try (Cursor cursor = resolver.query(
                targetUri,
                new String[]{
                    DocumentsContract.Document.COLUMN_MIME_TYPE,
                    DocumentsContract.Document.COLUMN_SIZE,
                    DocumentsContract.Document.COLUMN_LAST_MODIFIED
                },
                null, null, null
            )) {
                if (cursor != null && cursor.moveToFirst()) {
                    mime = cursor.getString(0);
                    if (!cursor.isNull(1)) sizeBytes = cursor.getLong(1);
                    if (!cursor.isNull(2)) lastModified = cursor.getLong(2);
                }
            } catch (Exception ignored) {
            }
            out.put("isDirectory", DocumentsContract.Document.MIME_TYPE_DIR.equals(mime));
            out.put("mimeType", mime != null ? mime : "application/octet-stream");
            out.put("sizeBytes", sizeBytes);
            out.put("lastModified", lastModified);
            call.resolve(out);
        } catch (SecurityException secEx) {
            call.reject("ACCESS_DENIED: Unable to check SAF entry: " + secEx.getMessage(), secEx);
        } catch (Exception ex) {
            call.reject("READ_FAILED: Failed checking SAF entry: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void deleteTreeEntry(PluginCall call) {
        String treeUriStr = call.getString("treeUri");
        String relativePath = call.getString("relativePath");
        if (treeUriStr == null || relativePath == null || relativePath.trim().isEmpty()) {
            call.reject("WRITE_FAILED: Missing treeUri or relativePath argument.");
            return;
        }
        try {
            Uri treeUri = Uri.parse(treeUriStr);
            ContentResolver resolver = getContext().getContentResolver();
            Uri targetUri = resolveTreePath(resolver, treeUri, relativePath);
            if (targetUri == null) {
                JSObject out = new JSObject();
                out.put("deleted", false);
                call.resolve(out);
                return;
            }
            boolean deleted = DocumentsContract.deleteDocument(resolver, targetUri);
            JSObject out = new JSObject();
            out.put("deleted", deleted);
            call.resolve(out);
        } catch (SecurityException secEx) {
            call.reject("ACCESS_DENIED: Unable to delete SAF entry: " + secEx.getMessage(), secEx);
        } catch (Exception ex) {
            call.reject("WRITE_FAILED: Failed deleting SAF entry: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void renameTreeEntry(PluginCall call) {
        String treeUriStr = call.getString("treeUri");
        String relativePath = call.getString("relativePath");
        String newName = call.getString("newName");
        if (treeUriStr == null || relativePath == null || newName == null || newName.trim().isEmpty()) {
            call.reject("WRITE_FAILED: Missing rename arguments.");
            return;
        }
        String cleanNewName = newName.trim();
        if (cleanNewName.contains("/") || cleanNewName.contains("\\") || "..".equals(cleanNewName)) {
            call.reject("WRITE_FAILED: Invalid target name.");
            return;
        }
        try {
            Uri treeUri = Uri.parse(treeUriStr);
            ContentResolver resolver = getContext().getContentResolver();
            Uri targetUri = resolveTreePath(resolver, treeUri, relativePath);
            if (targetUri == null) {
                call.reject("WRITE_FAILED: Source entry does not exist.");
                return;
            }
            Uri renamed = DocumentsContract.renameDocument(resolver, targetUri, cleanNewName);
            JSObject out = new JSObject();
            out.put("renamed", renamed != null);
            if (renamed != null) out.put("uri", renamed.toString());
            call.resolve(out);
        } catch (SecurityException secEx) {
            call.reject("ACCESS_DENIED: Unable to rename SAF entry: " + secEx.getMessage(), secEx);
        } catch (Exception ex) {
            call.reject("WRITE_FAILED: Failed renaming SAF entry: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void listTreeEntries(PluginCall call) {
        String treeUriStr = call.getString("treeUri");
        String relativeDir = call.getString("relativeDir", "");
        if (treeUriStr == null || treeUriStr.trim().isEmpty()) {
            call.reject("READ_FAILED: Missing treeUri argument.");
            return;
        }
        try {
            Uri treeUri = Uri.parse(treeUriStr);
            ContentResolver resolver = getContext().getContentResolver();
            Uri currentUri = resolveTreePath(resolver, treeUri, relativeDir);
            if (currentUri == null) {
                JSObject empty = new JSObject();
                empty.put("entries", new JSArray());
                call.resolve(empty);
                return;
            }

            String parentDocId = DocumentsContract.getDocumentId(currentUri);
            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId);
            JSArray entriesArr = new JSArray();
            String[] projection = new String[]{
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE,
                DocumentsContract.Document.COLUMN_SIZE,
                DocumentsContract.Document.COLUMN_LAST_MODIFIED
            };
            try (Cursor cursor = resolver.query(childrenUri, projection, null, null, null)) {
                if (cursor != null) {
                    while (cursor.moveToNext()) {
                        String docId = cursor.getString(0);
                        String name = cursor.getString(1);
                        String mime = cursor.getString(2);
                        long sizeBytes = cursor.isNull(3) ? 0L : cursor.getLong(3);
                        long lastModified = cursor.isNull(4) ? 0L : cursor.getLong(4);
                        if (name == null || name.endsWith(TEMP_SUFFIX)) continue;
                        Uri docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId);
                        JSObject item = new JSObject();
                        item.put("name", name);
                        item.put("isDirectory", DocumentsContract.Document.MIME_TYPE_DIR.equals(mime));
                        item.put("mimeType", mime != null ? mime : "application/octet-stream");
                        item.put("uri", docUri.toString());
                        item.put("sizeBytes", sizeBytes);
                        item.put("lastModified", lastModified);
                        entriesArr.put(item);
                    }
                }
            }
            JSObject out = new JSObject();
            out.put("entries", entriesArr);
            call.resolve(out);
        } catch (SecurityException secEx) {
            call.reject("ACCESS_DENIED: Unable to list SAF entries: " + secEx.getMessage(), secEx);
        } catch (Exception ex) {
            call.reject("READ_FAILED: Failed listing SAF entries: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void listTreeFiles(PluginCall call) {
        String treeUriStr = call.getString("treeUri");
        String relativeDir = call.getString("relativeDir", "");
        if (treeUriStr == null || treeUriStr.trim().isEmpty()) {
            call.reject("READ_FAILED: Missing treeUri argument.");
            return;
        }
        try {
            Uri treeUri = Uri.parse(treeUriStr);
            ContentResolver resolver = getContext().getContentResolver();
            Uri currentUri = resolveTreePath(resolver, treeUri, relativeDir);
            if (currentUri == null) {
                JSObject empty = new JSObject();
                empty.put("files", new JSArray());
                call.resolve(empty);
                return;
            }

            String parentDocId = DocumentsContract.getDocumentId(currentUri);
            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId);
            JSArray filesArr = new JSArray();
            String[] projection = new String[]{
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE
            };
            try (Cursor cursor = resolver.query(childrenUri, projection, null, null, null)) {
                if (cursor != null) {
                    while (cursor.moveToNext()) {
                        String docId = cursor.getString(0);
                        String name = cursor.getString(1);
                        String mime = cursor.getString(2);
                        if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) continue;
                        if (name != null && name.endsWith(TEMP_SUFFIX)) continue;
                        Uri docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId);
                        JSObject item = new JSObject();
                        item.put("name", name);
                        item.put("mimeType", mime != null ? mime : "application/octet-stream");
                        item.put("uri", docUri.toString());
                        filesArr.put(item);
                    }
                }
            }
            JSObject out = new JSObject();
            out.put("files", filesArr);
            call.resolve(out);
        } catch (SecurityException secEx) {
            call.reject("ACCESS_DENIED: Unable to list SAF directory: " + secEx.getMessage(), secEx);
        } catch (Exception ex) {
            call.reject("READ_FAILED: Failed listing SAF directory: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void openTreeSubfolder(PluginCall call) {
        String treeUriStr = call.getString("treeUri");
        String subdir = call.getString("subdir", "");
        if (treeUriStr == null || treeUriStr.trim().isEmpty()) {
            treeUriStr = getPrefs().getString(PREF_SAF_TREE_URI, null);
        }
        if (treeUriStr == null || treeUriStr.trim().isEmpty()) {
            JSObject out = new JSObject();
            out.put("opened", false);
            call.resolve(out);
            return;
        }
        try {
            Uri treeUri = Uri.parse(treeUriStr);
            ensureSubfoldersInTree(treeUri);
            ContentResolver resolver = getContext().getContentResolver();
            Uri targetUri = resolveTreePath(resolver, treeUri, subdir);
            if (targetUri == null) {
                JSObject out = new JSObject();
                out.put("opened", false);
                call.resolve(out);
                return;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(targetUri, DocumentsContract.Document.MIME_TYPE_DIR);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(intent);
                JSObject out = new JSObject();
                out.put("opened", true);
                out.put("uri", targetUri.toString());
                call.resolve(out);
            } catch (ActivityNotFoundException noViewer) {
                JSObject out = new JSObject();
                out.put("opened", false);
                out.put("uri", targetUri.toString());
                call.resolve(out);
            }
        } catch (SecurityException secEx) {
            call.reject("ACCESS_DENIED: Unable to open SAF folder: " + secEx.getMessage(), secEx);
        } catch (Exception ex) {
            JSObject out = new JSObject();
            out.put("opened", false);
            call.resolve(out);
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
