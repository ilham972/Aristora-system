// The one-time owner setup. The setup code was given to the owner in private; only its SHA-256 is here, and that
// can't be turned back into the code. It works only while nobody has an account yet: after the owner is set up,
// it does nothing.
//
// (A Convex environment variable ARISTORA_SETUP_SHA256 can replace it, e.g. for tests or to recover the owner
// account after clearing the users table in the Convex dashboard.)

const OWNER_SETUP_SHA256 = "c7990af67e106ed10ed3873d7ba75028e71599126153b413d3054964e774401e";

export function ownerSetupHash(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.ARISTORA_SETUP_SHA256 || OWNER_SETUP_SHA256;
}
