// Signing this phone in. It stays signed in until someone signs it out.
//   - The owner, once, with the setup code (a link with #setup=... or typed in).
//   - A teacher, by tapping the sign-in link the owner sent on WhatsApp (#join=...).
//   - Anyone with a PIN: name and PIN.

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { deviceLabel, errorText, mutate, randomKey } from "./backend";
import { useQuery } from "./live";
import { act, signedIn, toast } from "./store";
import { Sheet } from "./ui";

export type Hash = { setup?: string; join?: string };

export function readHash(): Hash {
  const p = new URLSearchParams(location.hash.replace(/^#/, ""));
  return { setup: p.get("setup") ?? undefined, join: p.get("join") ?? undefined };
}

/** Take the code out of the address bar (so it isn't shared or bookmarked by mistake). */
export function clearHash(): void {
  try {
    history.replaceState(null, "", location.pathname + location.search);
  } catch {
    location.hash = "";
  }
}

const ASK_PIN = "aristora.askPin";

function askPinLater() {
  try {
    localStorage.setItem(ASK_PIN, "1");
  } catch {
    /* private mode */
  }
}

export function pinAsked(): boolean {
  try {
    return localStorage.getItem(ASK_PIN) === "1";
  } catch {
    return false;
  }
}

export function stopAskingPin(): void {
  try {
    localStorage.removeItem(ASK_PIN);
  } catch {
    /* private mode */
  }
}

function Shell(props: { title: string; children: ComponentChildren }) {
  return (
    <main class="signin">
      <p class="si-brand">
        <span class="role-mark" aria-hidden="true" />
        ARISTORA class system
      </p>
      <section class="si-card">
        <h1>{props.title}</h1>
        {props.children}
      </section>
    </main>
  );
}

export function SignIn(props: { setupDone: boolean }) {
  const [hash, setHash] = useState<Hash>(readHash);
  const forget = () => {
    clearHash();
    setHash({});
  };
  if (hash.join) return <LinkSignIn code={hash.join} onPin={forget} />;
  if (hash.setup || !props.setupDone) return <OwnerSetup code={hash.setup ?? ""} done={props.setupDone} onPin={forget} />;
  return <PinSignIn />;
}

function LinkSignIn(props: { code: string; onPin: () => void }) {
  const peek = useQuery<{ name: string | null; problem: string | null }>(api.auth.peekLink, { code: props.code });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    const token = randomKey();
    try {
      const r = await mutate(api.auth.useLink, { code: props.code, token, label: deviceLabel() });
      clearHash();
      if (!r.hasPin) askPinLater();
      signedIn(token);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Shell title="Sign in">
      {peek === undefined ? (
        <p class="muted">Checking the link…</p>
      ) : peek.problem ? (
        <>
          <p class="si-error" role="alert">
            {peek.problem}
          </p>
          <button type="button" class="btn ghost wide" onClick={props.onPin}>
            Sign in with name and PIN instead
          </button>
        </>
      ) : (
        <>
          <p>
            This link signs in <b>{peek.name}</b> on this phone. The phone stays signed in.
          </p>
          <button type="button" class="btn primary wide big" disabled={busy} onClick={() => void go()}>
            Sign in as {peek.name}
          </button>
          <p class="muted small">Not {peek.name}? Don't tap it. The link is only for {peek.name}'s phone.</p>
        </>
      )}
      {error && (
        <p class="si-error" role="alert">
          {error}
        </p>
      )}
    </Shell>
  );
}

function PinFields(props: {
  pin: string;
  pin2?: string;
  setPin: (s: string) => void;
  setPin2?: (s: string) => void;
  autoComplete: string;
  label?: string;
}) {
  const clean = (e: Event) => (e.target as HTMLInputElement).value.replace(/\D/g, "").slice(0, 6);
  return (
    <>
      <label class="si-field">
        {props.label ?? "PIN (6 digits)"}
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={props.autoComplete}
          maxLength={6}
          value={props.pin}
          onInput={(e) => props.setPin(clean(e))}
        />
      </label>
      {props.setPin2 && (
        <label class="si-field">
          The same PIN again
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={props.autoComplete}
            maxLength={6}
            value={props.pin2}
            onInput={(e) => props.setPin2!(clean(e))}
          />
        </label>
      )}
    </>
  );
}

function OwnerSetup(props: { code: string; done: boolean; onPin: () => void }) {
  const [code, setCode] = useState(props.code);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (props.done) {
    return (
      <Shell title="Already set up">
        <p>The owner account is already set up. Sign in with your name and PIN, or ask the owner for a sign-in link.</p>
        <button type="button" class="btn primary wide" onClick={props.onPin}>
          Sign in
        </button>
      </Shell>
    );
  }
  const submit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    if (pin !== pin2) return setError("The two PINs are different. Type them again.");
    setBusy(true);
    const token = randomKey();
    try {
      await mutate(api.auth.setupOwner, { code, name, pin, token, label: deviceLabel() });
      clearHash();
      signedIn(token);
      toast(`Welcome, ${name.trim()}. You are the owner. Add your teachers in Settings, People.`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };
  return (
    <Shell title="Set up the owner account">
      <p>Once only. The owner can add teachers, choose what each may do, and sign lost phones out.</p>
      <form class="si-form" onSubmit={(e) => void submit(e)}>
        <label class="si-field">
          Setup code
          <input value={code} autoComplete="off" autoCapitalize="characters" spellcheck={false} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
        </label>
        <label class="si-field">
          Your name
          <input value={name} maxLength={40} autoComplete="name" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </label>
        <PinFields pin={pin} pin2={pin2} setPin={setPin} setPin2={setPin2} autoComplete="new-password" label="Choose a PIN (6 digits)" />
        <p class="muted small">You'll use the PIN to sign in on another phone. Don't use 123456 or your birthday.</p>
        {error && (
          <p class="si-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" class="btn primary wide big" disabled={busy || !code.trim() || !name.trim() || pin.length !== 6 || pin2.length !== 6}>
          Set up
        </button>
      </form>
    </Shell>
  );
}

function PinSignIn() {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const token = randomKey();
    try {
      const r = await mutate(api.auth.signInPin, { name, pin, token, label: deviceLabel() });
      if (r.ok) {
        signedIn(token);
        return;
      }
      setError(r.error);
      setPin("");
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  };
  return (
    <Shell title="Sign in">
      <p>
        <b>Easiest:</b> ask the owner to send you a sign-in link on WhatsApp, and tap it on this phone.
      </p>
      <p class="muted">Or, if you have a PIN:</p>
      <form class="si-form" onSubmit={(e) => void submit(e)}>
        <label class="si-field">
          Your name
          <input value={name} maxLength={40} autoComplete="username" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </label>
        <PinFields pin={pin} setPin={setPin} autoComplete="current-password" />
        {error && (
          <p class="si-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" class="btn primary wide big" disabled={busy || !name.trim() || pin.length !== 6}>
          Sign in
        </button>
      </form>
    </Shell>
  );
}

/** Set or change your PIN. With `first`, it's the question right after signing in with a link. */
export function PinSheet(props: { hasPin: boolean; first?: boolean; onClose: () => void }) {
  const [old, setOld] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (pin !== pin2) return toast("The two PINs are different. Type them again.", "error");
    setBusy(true);
    const r = await act(() => mutate(api.auth.setPin, { pin, old: props.hasPin ? old : undefined }));
    setBusy(false);
    if (r) {
      toast("PIN saved. Use it with your name if this phone ever signs you out.");
      props.onClose();
    }
  };
  return (
    <Sheet
      title={props.hasPin ? "Change your PIN" : "Choose a PIN"}
      sub={
        props.first
          ? "So you can sign in again if this phone forgets you. 6 digits."
          : "6 digits. Use it with your name to sign in on a phone that isn't signed in."
      }
      onClose={props.onClose}
      foot={
        <div class="row-actions">
          <button type="button" class="btn ghost" onClick={props.onClose}>
            {props.first ? "Later" : "Cancel"}
          </button>
          <button
            type="button"
            class="btn primary"
            disabled={busy || pin.length !== 6 || pin2.length !== 6 || (props.hasPin && old.length !== 6)}
            onClick={() => void save()}
          >
            Save PIN
          </button>
        </div>
      }
    >
      <div class="si-form">
        {props.hasPin && <PinFields pin={old} setPin={setOld} autoComplete="current-password" label="Your PIN now" />}
        <PinFields pin={pin} pin2={pin2} setPin={setPin} setPin2={setPin2} autoComplete="new-password" label="New PIN (6 digits)" />
      </div>
    </Sheet>
  );
}
