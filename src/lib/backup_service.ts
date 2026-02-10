import { backupClient } from "@/ipc/types/backup";
import { storage, auth } from "@/lib/firebase";
import { ref, uploadString, listAll, deleteObject } from "firebase/storage";
import { toast } from "sonner";

/**
 * Performs a full backup (Settings + Database + Stats) and uploads to Firebase.
 * Handles compression (via backend) and rotation (keeping last 3 backups).
 */
export async function performAndUploadBackup(isBackground: boolean = false): Promise<boolean> {
    const user = auth.currentUser;
    if (!user) {
        if (!isBackground) {
            toast.error("Debes iniciar sesión para realizar copias de seguridad");
        } else {
            console.warn("Skipping background backup: No user logged in");
        }
        return false;
    }

    try {
        if (!isBackground) {
            toast.loading("Iniciando copia de seguridad...", { id: "backup-process" });
        }

        // 1. Get data from Main process (now optimized with db.backup + gzip)
        const result = await backupClient.performBackup({
            includeSettings: true,
            includeDatabase: true,
            includeStats: true,
        });

        if (!result.success) {
            throw new Error(result.message);
        }

        // 2. Upload to Firebase Storage
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

        const uploadPromises = result.backupData.map(async (file) => {
            // Path: backups/{uid}/{timestamp}/{filename}
            const storageRef = ref(storage, `backups/${user.uid}/${timestamp}/${file.name}`);

            // Upload base64 content
            await uploadString(storageRef, file.content, "base64", {
                contentType: file.contentType,
            });
            return file.name;
        });

        await Promise.all(uploadPromises);

        // 3. Rotation: Keep only last 3 backups
        try {
            const backupsRootRef = ref(storage, `backups/${user.uid}`);
            const res = await listAll(backupsRootRef);

            if (res.prefixes.length > 3) {
                // Sort by name (ISO timestamp sorts alphabetically correctly)
                const sortedPrefixes = [...res.prefixes].sort((a, b) => a.name.localeCompare(b.name));

                // Delete oldest
                const toDelete = sortedPrefixes.slice(0, sortedPrefixes.length - 3);

                for (const prefix of toDelete) {
                    const folderRes = await listAll(prefix);
                    const deletePromises = folderRes.items.map(item => deleteObject(item));
                    await Promise.all(deletePromises);
                }
            }
        } catch (rotationError) {
            console.error("Error creating backup rotation:", rotationError);
            // Non-critical error, continue
        }

        if (!isBackground) {
            toast.success("Copia de seguridad completada exitosamente", { id: "backup-process" });
        } else {
            console.log("Background backup completed successfully");
        }

        return true;
    } catch (error: any) {
        console.error("Backup failed:", error);
        if (!isBackground) {
            toast.error(error.message || "Error al realizar la copia de seguridad", { id: "backup-process" });
        }
        return false;
    }
}
