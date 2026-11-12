// Groups, private chats and the Members page (8 Nov 2026) in their own file: a phone fetches it the first time Groups,
// Chats or Members opens (later.ts loadChat / useChatParts), never with the first screen; the teachers' Us (staff.tsx)
// uses it too. Import it only through useChatParts(), or it comes back into another file. Its size has its own budget
// (scripts/build.mjs FAMILY_CHAT_KB); its style is chatStyle.ts.
import { addChatStyle } from "./chatStyle";

addChatStyle();

export { AllChats, ChatList, PeopleScreen, RoomScreen } from "./chat";
// Online explanations (12 Nov 2026): the pill's sheet (a Level's book opens it through loadChat).
export { AskSheet } from "./help";
