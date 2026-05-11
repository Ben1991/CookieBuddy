import { applyI18n, getLanguage, initI18n, setLanguage, t } from "./i18n.js";

const output = document.querySelector("#detailsOutput");
const languageSelect = document.querySelector("#languageSelect");
let detailsPayload = null;

await initI18n();
applyLocalizedText();
output.textContent = t("loading");

languageSelect.addEventListener("change", async (event) => {
  await setLanguage(event.target.value);
  applyLocalizedText();
  renderDetails();
});

detailsPayload = await chrome.storage.local.get([
  "cookiebuddyLastScan",
  "cookiebuddyLastDelta"
]);
renderDetails();

function applyLocalizedText() {
  languageSelect.value = getLanguage();
  applyI18n();
}

function renderDetails() {
  if (!detailsPayload) return;

  output.textContent = JSON.stringify(
    {
      lastScan: detailsPayload.cookiebuddyLastScan || null,
      lastDelta: detailsPayload.cookiebuddyLastDelta || null
    },
    null,
    2
  );
}
