import { readSettings, decrypt } from "../src/main/settings";

function getOpenRouterKey() {
  const settings = readSettings();
  const openRouterSettings = settings.providerSettings?.openrouter as any;

  let apiKeySecret = openRouterSettings?.apiKey;
  if (
    openRouterSettings?.selectedKeyId &&
    openRouterSettings?.keys?.length > 0
  ) {
    const selectedKey = openRouterSettings.keys.find(
      (k: any) => k.id === openRouterSettings.selectedKeyId,
    );
    if (selectedKey) {
      apiKeySecret = selectedKey.key;
    }
  }

  let apiKey: string | undefined;
  if (apiKeySecret?.value) {
    apiKey =
      apiKeySecret.encryptionType === "plaintext"
        ? apiKeySecret.value
        : decrypt(apiKeySecret);
  }
  return apiKey?.trim();
}

console.log(getOpenRouterKey());
