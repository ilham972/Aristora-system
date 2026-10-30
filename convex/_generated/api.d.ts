/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as attendance from "../attendance.js";
import type * as auth from "../auth.js";
import type * as calls from "../calls.js";
import type * as catalog from "../catalog.js";
import type * as ceo from "../ceo.js";
import type * as clock from "../clock.js";
import type * as demo from "../demo.js";
import type * as families from "../families.js";
import type * as family from "../family.js";
import type * as focus from "../focus.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_backend from "../lib/backend.js";
import type * as lib_book from "../lib/book.js";
import type * as lib_ceo from "../lib/ceo.js";
import type * as lib_claims from "../lib/claims.js";
import type * as lib_day from "../lib/day.js";
import type * as lib_family from "../lib/family.js";
import type * as lib_key from "../lib/key.js";
import type * as lib_master from "../lib/master.js";
import type * as lib_owner from "../lib/owner.js";
import type * as lib_phone from "../lib/phone.js";
import type * as lib_progress from "../lib/progress.js";
import type * as lib_sha256 from "../lib/sha256.js";
import type * as lib_status from "../lib/status.js";
import type * as lib_syllabus from "../lib/syllabus.js";
import type * as marks from "../marks.js";
import type * as people from "../people.js";
import type * as progress from "../progress.js";
import type * as sessions from "../sessions.js";
import type * as setup from "../setup.js";
import type * as state from "../state.js";
import type * as students from "../students.js";
import type * as workbook from "../workbook.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  attendance: typeof attendance;
  auth: typeof auth;
  calls: typeof calls;
  catalog: typeof catalog;
  ceo: typeof ceo;
  clock: typeof clock;
  demo: typeof demo;
  families: typeof families;
  family: typeof family;
  focus: typeof focus;
  "lib/auth": typeof lib_auth;
  "lib/backend": typeof lib_backend;
  "lib/book": typeof lib_book;
  "lib/ceo": typeof lib_ceo;
  "lib/claims": typeof lib_claims;
  "lib/day": typeof lib_day;
  "lib/family": typeof lib_family;
  "lib/key": typeof lib_key;
  "lib/master": typeof lib_master;
  "lib/owner": typeof lib_owner;
  "lib/phone": typeof lib_phone;
  "lib/progress": typeof lib_progress;
  "lib/sha256": typeof lib_sha256;
  "lib/status": typeof lib_status;
  "lib/syllabus": typeof lib_syllabus;
  marks: typeof marks;
  people: typeof people;
  progress: typeof progress;
  sessions: typeof sessions;
  setup: typeof setup;
  state: typeof state;
  students: typeof students;
  workbook: typeof workbook;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
