import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import {
  DashboardView,
  HistoryView,
  QualityShell,
  ReleasesView,
  RunDetailView,
  RunTestsView,
  SecurityView,
  SettingsView,
  WallboardView,
} from "@mumsio/quality-ui";

const routes: RouteRecordRaw[] = [
  {
    path: "/admin/system-quality",
    component: QualityShell,
    children: [
      { path: "", name: "quality-dashboard", component: DashboardView },
      { path: "run", name: "quality-run", component: RunTestsView },
      { path: "history", name: "quality-history", component: HistoryView },
      { path: "history/:id", name: "quality-run-detail", component: RunDetailView },
      { path: "releases", name: "quality-releases", component: ReleasesView },
      { path: "security", name: "quality-security", component: SecurityView },
      { path: "settings", name: "quality-settings", component: SettingsView },
    ],
  },
  { path: "/admin/system-quality/wallboard", name: "quality-wallboard", component: WallboardView },
  { path: "/:pathMatch(.*)*", redirect: "/admin/system-quality" },
];

export const router = createRouter({ history: createWebHistory(), routes, scrollBehavior: () => ({ top: 0 }) });
