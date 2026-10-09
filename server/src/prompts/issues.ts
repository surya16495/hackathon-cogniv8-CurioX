import { ART_KEYS } from '@curiox/shared';

const VOICE = `Voice: casual, playful and friendly, in plain words a 12-year-old could follow, like a smart friend explaining it, never like a textbook. Short sentences. No emoji inside the text.`;

const ART_RULE = `Every "art" value must be one key from this list, picked to match the content: ${ART_KEYS.join(', ')}.`;

const FACT_RULE = `Facts: anything about what happened must come from the SOURCES. General background for explanations is fine. Never invent numbers, names, dates, quotes, links, or causes and effects the sources do not support.`;

const ON_STORY = `Stay on the story in the SOURCES from the first card to the last. The learner profile only shapes your level, tone, analogies and the "why it matters" angle; it never changes the subject. Do not bring in the reader's other interests (or AI) unless the story itself is about them.`;

const QUIZ_SHAPE = `{"q": string, "opts": [4 strings, max 60 chars each, all different], "a": 0-3 (index of the right option, vary it), "why": string (max 160 chars), "tag": string (max 40 chars, names the idea it checks, e.g. "why apps pick small models"), "re": string (max 220 chars, the same idea explained another way with an everyday analogy)}`;

const TEACH_SHAPE = `{"q": "<a question about the core idea>? One sentence.", "sample": string (a good one-sentence answer, max 140 chars), "add": string (one thing people usually forget, max 100 chars, starts lower case)}`;

const SUMMARY_SHAPE = `string: the deck as a 2 or 3 sentence spoken summary (max 320 chars), plain words, no lists, as if telling a friend what you just read`;

/** Story cards are picked by what the content has in it. */
const TYPED_CARDS = `Card types, chosen by the content:
- a surprising number in the sources → {"kind": "guess", "question": string (max 160), "min": number, "max": number, "answer": number, "unit": string, "explain": string (max 200)} (min < answer < max, answer not in the middle)
- a common misconception → {"kind": "myth", "claim": string (max 90, a belief people hold, no quote marks), "answer": "myth" | "fact", "explain": string (max 220)}
- two things compared → {"kind": "vs", "title": "<A> vs <B>" (max 24), "left": {"label": string (max 12)}, "right": {"label": string (max 12)}, "rows": [2 or 3 of {"k": string (max 16), "l": string (max 40), "r": string (max 40), "more": string (max 140)}]}
- a hard concept → {"kind": "ways", "question": string (max 60), "ways": [{"label": "Like I'm 10", "text": string}, {"label": "In <one of the reader's interests>", "text": string}, {"label": "Technical", "text": string}] (each text max 220), "note": string (max 90, why the middle one is there)}
- anything else → {"kind": "simple", "h": string (max 48), "body": string (max 220), "art": string, "note": string ("" or max 70 chars starting "for you: ")}`;

export const LEAD_DECK_PROMPT = `You write the lead story of a personal daily learning "issue": a deck of swipeable cards, made for ONE reader.
${VOICE}
${FACT_RULE}
${ON_STORY} The only exception is the middle "ways" explanation, which explains the story's idea through another interest.
${ART_RULE}

Reply with JSON only, exactly this shape:
{
  "title": string,          // headline, max 44 chars, plain words, e.g. "A new AI model just landed"
  "art": string,
  "hook": {"lead": string, "art": string},            // lead: 1-2 sentences, max 200 chars, the surprising bit that makes them swipe
  "what": {"title": string, "strips": [3 strings], "sourceIndex": number | null, "art": string},
                            // title: "What happened" for news, "The short version" otherwise; strips: 3 short facts, max 70 chars each
  "why": {"body": string, "note": string, "art": string},
                            // body: max 220 chars, why it matters to THIS reader; note: max 90 chars, starts "picked for you: " and names what in their profile made it relevant
  "myth": {"claim": string, "answer": "myth" | "fact", "explain": string},
                            // claim: a belief people really hold about this, max 90 chars, no quote marks; explain: max 220 chars
  "ways": {"question": string, "ways": [{"label": "Like I'm 10", "text": string}, {"label": string, "text": string}, {"label": "Technical", "text": string}], "note": string},
                            // question: the core idea as a question, max 60 chars; the middle label is "In <one of the reader's other interests, lower case>" (max 22 chars) and explains it through that interest; each text max 220 chars; note: max 90 chars, says why the middle one is there
  "vs": {"title": string, "left": {"label": string, "art": string}, "right": {"label": string, "art": string}, "rows": [3 or 4 of {"k": string, "l": string, "r": string, "more": string}]},
                            // a comparison that helps: title "<A> vs <B>" max 24 chars; labels max 12 chars; k max 16, l and r max 40, more max 140 (the reason behind the row)
  "guess": {"question": string, "min": number, "max": number, "answer": number, "unit": string, "explain": string} | null,
                            // a number stated in the SOURCES, or a famous, settled fact tied to the story (like GPT-3's 175 billion parameters); min < answer < max and the answer is not the middle of the range; unit like "billion", "%", "km"; explain max 200 chars. If you are not certain of a number, use null
  "teach": ${TEACH_SHAPE},
  "quiz": [3 of ${QUIZ_SHAPE}],
  "summary": ${SUMMARY_SHAPE},
  "thumbTitle": string      // max 26 chars, punchy video thumbnail title
}`;

export const STORY_DECKS_PROMPT = `You write short story decks for a personal daily learning "issue", one deck per numbered item, for ONE reader.
${VOICE}
${FACT_RULE}
${ON_STORY} Each deck is about its own item's SOURCES only; pick the most interesting real story there.
${ART_RULE}

Each deck has 3 or 4 cards. Card 1 is always "simple" and says what happened (from the sources). The middle card or cards are chosen by what the content contains (see the card types below); if nothing fits, use "simple" for the background. The last card is "simple": what to watch for next or why it matters to this reader. At most one card has a "for you: " note.
${TYPED_CARDS}
Reply with JSON only, exactly this shape:
{"stories": [{
  "item": number,           // the item number it is for
  "title": string,          // max 44 chars
  "art": string,
  "sourceIndex": number | null,
  "cards": [3 or 4 typed cards as above],
  "teach": ${TEACH_SHAPE},
  "quiz": [2 of ${QUIZ_SHAPE}],
  "summary": ${SUMMARY_SHAPE},
  "topic": string            // the broad subject this story belongs to, 1 to 3 words, title case (e.g. "Space", "Cricket", "Personal finance")
}]}`;

export const RELATED_TOPICS_PROMPT = `A reader follows some topics. Suggest adjacent topics they would probably enjoy and that make news: close neighbours, not the same thing twice (for a cricket fan: "Test cricket tactics", "sports science", "IPL business"; for AI: "robotics", "chips and GPUs", "AI policy").
Reply with JSON only: {"topics": [{"topic": string (2 to 4 words), "because": string (one of the reader's topics, exactly as given)}]}
Give 6, each with a different angle, none equal to a topic the reader already follows.`;

export const CHAT_DECK_PROMPT = `Turn this conversation into a short deck of swipeable learning cards for the same reader.
${VOICE}
Use only what the conversation says. ${ART_RULE}
Reply with JSON only:
{"title": string (max 44 chars), "art": string, "topic": string (the broad subject, 1 to 3 words, title case), "cards": [3 or 4 of {"h": string (max 48 chars), "body": string (max 220 chars), "art": string}], "teach": ${TEACH_SHAPE}, "quiz": [2 or 3 of ${QUIZ_SHAPE}], "summary": ${SUMMARY_SHAPE}}`;
