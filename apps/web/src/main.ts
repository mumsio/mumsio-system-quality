import { createApp } from "vue";
import { createQualityApi, installQualityUi } from "@mumsio/quality-ui";
import "../../../packages/quality-ui/src/styles.css";
import App from "./App.vue";
import { router } from "./router";

const app = createApp(App);
const developmentActorHeaders: Record<string, string> | undefined = import.meta.env.DEV
  ? {
      "X-Quality-User-Id": import.meta.env.VITE_QUALITY_USER_ID || "00000000-0000-4000-8000-000000000001",
      "X-Quality-User-Name": import.meta.env.VITE_QUALITY_USER_NAME || "Quality Owner",
      "X-Quality-Role": import.meta.env.VITE_QUALITY_ROLE || "owner",
    }
  : undefined;
installQualityUi(app, createQualityApi(
  import.meta.env.VITE_QUALITY_API_BASE_URL || "/api/quality",
  fetch,
  developmentActorHeaders === undefined ? {} : { defaultHeaders: developmentActorHeaders },
));
app.use(router);
app.mount("#app");
