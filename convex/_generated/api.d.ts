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
import type * as boss from "../boss.js";
import type * as calls from "../calls.js";
import type * as catalog from "../catalog.js";
import type * as chat from "../chat.js";
import type * as clock from "../clock.js";
import type * as consult from "../consult.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as desk from "../desk.js";
import type * as duty from "../duty.js";
import type * as families from "../families.js";
import type * as family from "../family.js";
import type * as focus from "../focus.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_backend from "../lib/backend.js";
import type * as lib_book from "../lib/book.js";
import type * as lib_boss from "../lib/boss.js";
import type * as lib_chat from "../lib/chat.js";
import type * as lib_claims from "../lib/claims.js";
import type * as lib_consult from "../lib/consult.js";
import type * as lib_day from "../lib/day.js";
import type * as lib_dept from "../lib/dept.js";
import type * as lib_family from "../lib/family.js";
import type * as lib_feeRows from "../lib/feeRows.js";
import type * as lib_fn from "../lib/fn.js";
import type * as lib_free from "../lib/free.js";
import type * as lib_homeWork from "../lib/homeWork.js";
import type * as lib_key from "../lib/key.js";
import type * as lib_ladder from "../lib/ladder.js";
import type * as lib_leads from "../lib/leads.js";
import type * as lib_marking from "../lib/marking.js";
import type * as lib_master from "../lib/master.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_owner from "../lib/owner.js";
import type * as lib_phone from "../lib/phone.js";
import type * as lib_photos from "../lib/photos.js";
import type * as lib_profile from "../lib/profile.js";
import type * as lib_progress from "../lib/progress.js";
import type * as lib_push from "../lib/push.js";
import type * as lib_questions from "../lib/questions.js";
import type * as lib_race from "../lib/race.js";
import type * as lib_raceRows from "../lib/raceRows.js";
import type * as lib_sha256 from "../lib/sha256.js";
import type * as lib_sim from "../lib/sim.js";
import type * as lib_status from "../lib/status.js";
import type * as lib_syllabus from "../lib/syllabus.js";
import type * as lib_timeline from "../lib/timeline.js";
import type * as lib_us from "../lib/us.js";
import type * as lib_usTalk from "../lib/usTalk.js";
import type * as lib_usToday from "../lib/usToday.js";
import type * as lib_usXp from "../lib/usXp.js";
import type * as lib_work from "../lib/work.js";
import type * as manager from "../manager.js";
import type * as marks from "../marks.js";
import type * as money from "../money.js";
import type * as people from "../people.js";
import type * as photos from "../photos.js";
import type * as preview from "../preview.js";
import type * as progress from "../progress.js";
import type * as push from "../push.js";
import type * as pushSubs from "../pushSubs.js";
import type * as race from "../race.js";
import type * as sessions from "../sessions.js";
import type * as setup from "../setup.js";
import type * as sim from "../sim.js";
import type * as state from "../state.js";
import type * as students from "../students.js";
import type * as teach from "../teach.js";
import type * as us from "../us.js";
import type * as work from "../work.js";
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
  boss: typeof boss;
  calls: typeof calls;
  catalog: typeof catalog;
  chat: typeof chat;
  clock: typeof clock;
  consult: typeof consult;
  crons: typeof crons;
  demo: typeof demo;
  desk: typeof desk;
  duty: typeof duty;
  families: typeof families;
  family: typeof family;
  focus: typeof focus;
  "lib/auth": typeof lib_auth;
  "lib/backend": typeof lib_backend;
  "lib/book": typeof lib_book;
  "lib/boss": typeof lib_boss;
  "lib/chat": typeof lib_chat;
  "lib/claims": typeof lib_claims;
  "lib/consult": typeof lib_consult;
  "lib/day": typeof lib_day;
  "lib/dept": typeof lib_dept;
  "lib/family": typeof lib_family;
  "lib/feeRows": typeof lib_feeRows;
  "lib/fn": typeof lib_fn;
  "lib/free": typeof lib_free;
  "lib/homeWork": typeof lib_homeWork;
  "lib/key": typeof lib_key;
  "lib/ladder": typeof lib_ladder;
  "lib/leads": typeof lib_leads;
  "lib/marking": typeof lib_marking;
  "lib/master": typeof lib_master;
  "lib/money": typeof lib_money;
  "lib/owner": typeof lib_owner;
  "lib/phone": typeof lib_phone;
  "lib/photos": typeof lib_photos;
  "lib/profile": typeof lib_profile;
  "lib/progress": typeof lib_progress;
  "lib/push": typeof lib_push;
  "lib/questions": typeof lib_questions;
  "lib/race": typeof lib_race;
  "lib/raceRows": typeof lib_raceRows;
  "lib/sha256": typeof lib_sha256;
  "lib/sim": typeof lib_sim;
  "lib/status": typeof lib_status;
  "lib/syllabus": typeof lib_syllabus;
  "lib/timeline": typeof lib_timeline;
  "lib/us": typeof lib_us;
  "lib/usTalk": typeof lib_usTalk;
  "lib/usToday": typeof lib_usToday;
  "lib/usXp": typeof lib_usXp;
  "lib/work": typeof lib_work;
  manager: typeof manager;
  marks: typeof marks;
  money: typeof money;
  people: typeof people;
  photos: typeof photos;
  preview: typeof preview;
  progress: typeof progress;
  push: typeof push;
  pushSubs: typeof pushSubs;
  race: typeof race;
  sessions: typeof sessions;
  setup: typeof setup;
  sim: typeof sim;
  state: typeof state;
  students: typeof students;
  teach: typeof teach;
  us: typeof us;
  work: typeof work;
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
