// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import StatusBadge from "./StatusBadge.vue";

describe("StatusBadge", () => {
  it("includes a text label so status is not color-only", () => {
    const wrapper = mount(StatusBadge, { props: { status: "warning" } });
    expect(wrapper.text()).toContain("warning");
    expect(wrapper.classes()).toContain("status-warning");
  });
});
