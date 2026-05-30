import { NextResponse, type NextRequest } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  completeInternalAuthForUser,
  internalAuthFailureMessage
} from "@/lib/auth/contractor-link";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const nextParam = requestUrl.searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  const errorDescription =
    requestUrl.searchParams.get("error_description") ??
    requestUrl.searchParams.get("error");

  if (process.env.NODE_ENV === "development") {
    console.info("Supabase auth callback diagnostic", {
      hasCode: Boolean(code),
      hasTokenHash: Boolean(tokenHash),
      hasError: Boolean(errorDescription),
      type
    });
  }

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Supabase auth callback failed", {
        message: error.message,
        code: error.code
      });

      return redirectToLogin(
        requestUrl,
        "Your invite link could not be completed. Please request a new invite."
      );
    }

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return redirectToLogin(
        requestUrl,
        "Your invite session could not be verified. Please request a new invite."
      );
    }

    const authResult = await completeInternalAuthForUser({
      authUserEmail: user.email,
      authUserId: user.id
    });

    if (!authResult.ok) {
      await supabase.auth.signOut();
      return redirectToLogin(requestUrl, internalAuthFailureMessage(authResult.reason));
    }

    return NextResponse.redirect(new URL(next, requestUrl.origin));
  }

  if (tokenHash && type) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType
    });

    if (error) {
      console.error("Supabase auth token callback failed", {
        message: error.message,
        code: error.code
      });

      return redirectToLogin(
        requestUrl,
        "Your invite link could not be completed. Please request a new invite."
      );
    }

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return redirectToLogin(
        requestUrl,
        "Your invite session could not be verified. Please request a new invite."
      );
    }

    const authResult = await completeInternalAuthForUser({
      authUserEmail: user.email,
      authUserId: user.id
    });

    if (!authResult.ok) {
      await supabase.auth.signOut();
      return redirectToLogin(requestUrl, internalAuthFailureMessage(authResult.reason));
    }

    return NextResponse.redirect(new URL(next, requestUrl.origin));
  }

  if (errorDescription) {
    return redirectToLogin(
      requestUrl,
      "Your invite link was rejected. Please request a new invite."
    );
  }

  return new NextResponse(authCallbackHtml(), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
  } | null;
  const accessToken = body?.access_token;
  const refreshToken = body?.refresh_token;

  if (!accessToken || !refreshToken) {
    return NextResponse.json(
      {
        ok: false,
        message: "Your invite link could not be completed. Please request a new invite."
      },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });

  if (sessionError) {
    return NextResponse.json(
      {
        ok: false,
        message: "Your invite session could not be verified. Please request a new invite."
      },
      { status: 400 }
    );
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      {
        ok: false,
        message: "Your invite session could not be verified. Please request a new invite."
      },
      { status: 401 }
    );
  }

  const authResult = await completeInternalAuthForUser({
    authUserEmail: user.email,
    authUserId: user.id
  });

  if (!authResult.ok) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { ok: false, message: internalAuthFailureMessage(authResult.reason) },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true, redirectTo: "/dashboard" });
}

function redirectToLogin(requestUrl: URL, message: string) {
  return NextResponse.redirect(
    new URL(`/login?message=${encodeURIComponent(message)}`, requestUrl.origin)
  );
}

function authCallbackHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Completing invite | Still Partners</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #f8fafc; color: #111827; }
      main { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
      section { width: 100%; max-width: 420px; background: white; border-radius: 12px; padding: 28px; text-align: center; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.12); }
      .eyebrow { color: #f59e0b; font-size: 12px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; }
      h1 { margin: 12px 0 0; font-size: 26px; line-height: 1.15; }
      p { color: #475569; line-height: 1.55; }
      #callback-status { margin-top: 18px; padding: 12px; border-radius: 8px; background: #f1f5f9; color: #334155; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <div class="eyebrow">Internal Beta</div>
        <h1>Completing your invite</h1>
        <p>Keep this page open while Still Partners verifies your account.</p>
        <div id="callback-status">Checking invite link...</div>
      </section>
    </main>
    <script>
      (async function () {
        var status = document.getElementById("callback-status");
        function fail(message) {
          if (status) status.textContent = message;
          window.location.replace("/login?message=" + encodeURIComponent(message));
        }

        try {
          var hash = window.location.hash ? window.location.hash.slice(1) : "";
          var params = new URLSearchParams(hash);
          var accessToken = params.get("access_token");
          var refreshToken = params.get("refresh_token");

          if (!accessToken || !refreshToken) {
            fail("Your invite link could not be completed. Please request a new invite.");
            return;
          }

          window.history.replaceState(null, "", "/auth/callback");
          if (status) status.textContent = "Verifying invite...";

          var response = await fetch("/auth/callback", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              access_token: accessToken,
              refresh_token: refreshToken
            })
          });
          var result = await response.json().catch(function () { return null; });

          if (!response.ok || !result || !result.ok) {
            fail((result && result.message) || "Your invite link could not be completed. Please request a new invite.");
            return;
          }

          if (status) status.textContent = "Invite complete. Opening dashboard...";
          window.location.replace(result.redirectTo || "/dashboard");
        } catch (error) {
          fail("Your invite link could not be completed. Please request a new invite.");
        }
      })();
    </script>
  </body>
</html>`;
}
