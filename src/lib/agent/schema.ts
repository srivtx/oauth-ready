// JSON Schemas passed to Gemini structured output so enums (evidence, owner,
// unit, tier) are enforced by the API rather than hoped for in the prompt.

const str = { type: "string" };
const num = { type: "number" };
const ev = { type: "string", enum: ["tested", "sourced", "inferred"] };
const owner = { type: "string", enum: ["agent", "you", "provider"] };
const milestone = { type: "string", enum: ["dev", "prod"] };
const srcs = { type: "array", items: str };
const obj = (properties: Record<string, unknown>, optional: string[] = []) => ({
  type: "object",
  properties,
  required: Object.keys(properties).filter((k) => !optional.includes(k)),
});
const claim = obj({ text: str, evidence: ev, sources: srcs });

export const PLAN_SCHEMA = obj(
  {
    name: str,
    slug: str,
    website: str,
    category: str,
    supportsOAuth: { type: "string", enum: ["yes", "no", "unclear"] },
    candidateUrls: { type: "array", items: obj({ url: str, why: str }) },
    authorizeEndpointGuess: str,
    oidcHosts: { type: "array", items: str },
    developerPortal: str,
  },
  ["authorizeEndpointGuess", "developerPortal"],
);

export const FOLLOW_SCHEMA = obj({ urls: { type: "array", items: str } });

export const DRAFT_SCHEMA = obj(
  {
    name: str,
    website: str,
    category: str,
    verdict: obj({ difficulty: { type: "integer", minimum: 1, maximum: 5 }, label: str, headline: str }),
    timeToDev: str,
    timeToProd: str,
    paths: { type: "array", minItems: 2, items: obj({ name: str, when: str, outcome: str }) },
    phases: {
      type: "array",
      minItems: 3,
      items: obj(
        {
          label: str,
          kind: { type: "string", enum: ["work", "wait"] },
          owner,
          min: num,
          max: num,
          unit: { type: "string", enum: ["minutes", "hours", "days", "weeks"] },
          milestone,
          evidence: ev,
          sources: srcs,
          note: str,
        },
        ["note"],
      ),
    },
    steps: {
      type: "array",
      minItems: 5,
      items: obj(
        {
          title: str,
          owner,
          milestone,
          detail: str,
          url: str,
          evidence: ev,
          sources: srcs,
          artifact: obj({ label: str, kind: { type: "string", enum: ["link", "code", "text"] }, content: str }),
        },
        ["url", "artifact"],
      ),
    },
    requirements: { type: "array", minItems: 2, items: claim },
    scopes: {
      type: "array",
      items: obj({ name: str, tier: { type: "string", enum: ["basic", "sensitive", "restricted", "gated"] }, note: str, evidence: ev, sources: srcs }),
    },
    gotchas: { type: "array", minItems: 2, items: claim },
    blockers: { type: "array", minItems: 2, items: obj({ problem: str, fix: str, evidence: ev, sources: srcs }) },
    probeNotes: { type: "array", items: obj({ url: str, meaning: str }) },
    uncertainties: { type: "array", items: str },
  },
  ["probeNotes"],
);

export const VERIFY_SCHEMA = obj({ checks: { type: "array", items: obj({ id: str, quote: str }) } });
