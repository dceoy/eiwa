import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, expect, it } from "vitest";
import { SourcesModal } from "./SourcesModal";

const source = {
  name: "JMdict — Electronic Dictionary Research and Development Group (EDRDG)",
  license: "CC BY-SA 4.0",
  url: "https://www.edrdg.org/edrdg/licence.html",
};

afterEach(cleanup);

it("shows license URLs and adaptation/attribution notes from depth sources", () => {
  render(
    <SourcesModal
      open
      onClose={() => undefined}
      licenses={[
        {
          name: "Tatoeba contributors",
          license: "CC BY 2.0 FR",
          licenseUrl: "https://creativecommons.org/licenses/by/2.0/fr/",
          attribution: "Text unchanged; contributor credits accompany every sentence.",
        },
      ]}
    />,
  );
  expect(screen.getByRole("link", { name: "CC BY 2.0 FR" }).getAttribute("href")).toBe(
    "https://creativecommons.org/licenses/by/2.0/fr/",
  );
  expect(
    screen.getByText("Text unchanged; contributor credits accompany every sentence."),
  ).toBeTruthy();
});

it("shows the production manifest's EDRDG attribution, license and link", () => {
  render(<SourcesModal open onClose={() => undefined} licenses={[source]} />);
  expect(screen.getByText(source.name)).toBeTruthy();
  expect(screen.getByText(/CC BY-SA 4.0/)).toBeTruthy();
  expect(screen.getByRole("link", { name: source.url }).getAttribute("href")).toBe(source.url);
});
