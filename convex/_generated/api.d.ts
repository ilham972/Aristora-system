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
import type * as calls from "../calls.js";
import type * as catalog from "../catalog.js";
import type * as clock from "../clock.js";
import type * as demo from "../demo.js";
import type * as lib_backend from "../lib/backend.js";
import type * as lib_book from "../lib/book.js";
import type * as lib_master from "../lib/master.js";
import type * as lib_status from "../lib/status.js";
import type * as lib_syllabus from "../lib/syllabus.js";
import type * as marks from "../marks.js";
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
  calls: typeof calls;
  catalog: typeof catalog;
  clock: typeof clock;
  demo: typeof demo;
  "lib/backend": typeof lib_backend;
  "lib/book": typeof lib_book;
  "lib/master": typeof lib_master;
  "lib/status": typeof lib_status;
  "lib/syllabus": typeof lib_syllabus;
  marks: typeof marks;
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
