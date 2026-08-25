import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { User, Lock, Upload, X, Palette } from "@/components/ui/icons";
import { SimpleAvatar } from "@/components/ui/SimpleAvatar";
import { useSetAtom } from "jotai";
import { userAtom, VibesUser } from "@/atoms/authAtoms";
import { ipc } from "@/ipc/types";
import { useI18n } from "@/lib/i18n";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: VibesUser;
}

export function ProfileModal({ isOpen, onClose, user }: ProfileModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState(user?.displayName || "");
  const [photoURL, setPhotoURL] = useState(user?.photoUrl || "");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const setUser = useSetAtom(userAtom);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleUpdateProfile = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const updatedUser = await (ipc as any).auth.updateProfile({
        userId: user.id,
        displayName: name,
        photoUrl: photoURL,
      });

      setUser(updatedUser);
      toast.success(t("accountSettings.profileUpdated"));
      onClose();
    } catch (error: any) {
      toast.error(error.message || t("accountSettings.profileUpdateError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsLoading(true);
    try {
      const extension = file.name.split(".").pop();
      const fileName = `avatar-${user.id}-${Date.now()}.${extension}`;

      // Read file as ArrayBuffer
      const fileData = await file.arrayBuffer();

      // Upload via IPC to Bunny Storage
      const url = await (ipc as any).bunny.uploadAvatar({
        fileName,
        data: fileData,
        contentType: file.type,
      });

      // Update profile via IPC
      const updatedUser = await (ipc as any).auth.updateProfile({
        userId: user.id,
        photoUrl: url,
      });

      setUser(updatedUser);
      setPhotoURL(url);
      toast.success(t("accountSettings.imageUploaded"));
    } catch (error: any) {
      toast.error(t("accountSettings.imageUploadError"));
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!user) return;
    if (newPassword !== confirmPassword) {
      toast.error(t("accountSettings.passwordsDoNotMatch"));
      return;
    }

    setIsLoading(true);
    try {
      await (ipc as any).auth.changePassword({
        userId: user.id,
        currentPassword,
        newPassword,
      });
      toast.success(t("accountSettings.passwordUpdated"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onClose();
    } catch (error: any) {
      toast.error(error.message || t("accountSettings.passwordUpdateError"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none bg-background">
        <div className="p-6 space-y-4">
          <DialogHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <DialogTitle>{t("accountSettings.title")}</DialogTitle>
              <DialogDescription className="typo-caption">
                {t("accountSettings.description")}
              </DialogDescription>
            </div>
          </DialogHeader>

          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1 h-12">
              <TabsTrigger
                value="profile"
                className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 shadow-none border-none typo-tab"
              >
                <User className="h-4 w-4" />
                {t("accountSettings.tabProfile")}
              </TabsTrigger>
              <TabsTrigger
                value="password"
                className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 shadow-none border-none typo-tab"
              >
                <Lock className="h-4 w-4" />
                {t("accountSettings.tabPassword")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-6 pt-6">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="relative group">
                  <div className="h-32 w-32 rounded-full overflow-hidden border-4 border-muted flex items-center justify-center bg-muted">
                    <SimpleAvatar
                      src={photoURL}
                      fallbackText={name?.[0] || user?.email?.[0] || "U"}
                      className="h-full w-full text-4xl"
                    />
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                >
                  <Upload className="h-4 w-4" />
                  {t("accountSettings.changePhoto")}
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName" className="typo-label">
                    {t("accountSettings.displayName")}
                  </Label>
                  <Input
                    id="displayName"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("accountSettings.displayNamePlaceholder")}
                    className="h-10"
                  />
                </div>
                <div className="p-4 rounded-lg border bg-muted/30 space-y-1">
                  <p className="typo-caption">
                    {t("accountSettings.yourEmail")}{" "}
                    <span className="font-bold">{user?.email}</span>
                  </p>
                  <p className="typo-micro uppercase">
                    {t("accountSettings.emailCannotChange")}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={onClose}>
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleUpdateProfile}
                  disabled={isLoading}
                  className="bg-[#1a1f2e] hover:bg-[#2a2f3e] text-white"
                >
                  {t("accountSettings.saveChanges")}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="password" className="space-y-4 pt-6">
              <div className="space-y-1">
                <h3 className="typo-label">{t("accountSettings.changePasswordTitle")}</h3>
                <p className="typo-caption">
                  {t("accountSettings.changePasswordDesc")}
                </p>
              </div>

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="current"
                    className="typo-micro uppercase tracking-wider"
                  >
                    {t("accountSettings.currentPassword")}
                  </Label>
                  <Input
                    id="current"
                    type="password"
                    placeholder={t("accountSettings.currentPasswordPlaceholder")}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="new"
                    className="typo-micro uppercase tracking-wider"
                  >
                    {t("accountSettings.newPassword")}
                  </Label>
                  <Input
                    id="new"
                    type="password"
                    placeholder={t("accountSettings.newPasswordPlaceholder")}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="confirm"
                    className="typo-micro uppercase tracking-wider"
                  >
                    {t("accountSettings.confirmNewPassword")}
                  </Label>
                  <Input
                    id="confirm"
                    type="password"
                    placeholder={t("accountSettings.confirmNewPasswordPlaceholder")}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/50 p-4 rounded-lg">
                <p className="typo-caption">
                  <span className="font-bold">{t("accountSettings.importantNotePrefix")}</span>{" "}
                  {t("accountSettings.importantNote")}
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={onClose}>
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleUpdatePassword}
                  disabled={isLoading}
                  className="bg-[#1a1f2e] hover:bg-[#2a2f3e] text-white shadow-none"
                >
                  {t("accountSettings.changePasswordButton")}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
