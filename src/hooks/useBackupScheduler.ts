import { useEffect } from 'react';
import { performAndUploadBackup } from '@/lib/backup_service';

const BACKUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function useBackupScheduler() {
    useEffect(() => {
        console.log("Backup scheduler initialized. Next backup in 60 minutes.");

        const timer = setInterval(() => {
            console.log("Triggering scheduled background backup...");
            performAndUploadBackup(true).catch(err => {
                console.error("Scheduled backup failed:", err);
            });
        }, BACKUP_INTERVAL_MS);

        return () => clearInterval(timer);
    }, []);
}
