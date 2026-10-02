import { describe, expect, it } from "vitest";

import { lerSessaoDoLink } from "./sessao-do-link";

describe("lerSessaoDoLink", () => {
  it("le os dois tokens do fragmento", () => {
    expect(
      lerSessaoDoLink("#access_token=aaa&expires_in=3600&refresh_token=rrr&token_type=bearer&type=recovery"),
    ).toEqual({ ok: true, accessToken: "aaa", refreshToken: "rrr" });
  });

  it("aceita o fragmento sem o #", () => {
    expect(lerSessaoDoLink("access_token=aaa&refresh_token=rrr").ok).toBe(true);
  });

  it("link vencido (erro no fragmento) ou sem token nao abre sessao", () => {
    expect(lerSessaoDoLink("#error=access_denied&error_code=otp_expired")).toEqual({ ok: false });
    expect(lerSessaoDoLink("#access_token=aaa")).toEqual({ ok: false });
    expect(lerSessaoDoLink("")).toEqual({ ok: false });
  });
});
