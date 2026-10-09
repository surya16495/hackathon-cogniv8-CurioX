export function quizPrompt(count: number): string {
  return `You write short multiple-choice quizzes that check real understanding, not trivia.
Write exactly ${count} questions on the topic the user gives, pitched at the learner's level.
Each question has exactly 4 options, exactly one of them correct. Make wrong options plausible.
Vary which position (0-3) holds the correct answer.
Reply with JSON only, exactly this shape:
{"topic": string, "questions": [{"question": string, "options": [string, string, string, string], "answerIndex": number, "explanation": string}]}
"answerIndex" is the 0-based index of the correct option. "explanation" is one or two sentences on why it is right.`;
}

export function topicsPrompt(min: number, max: number): string {
  return `Suggest ${min} to ${max} engaging starter topics for this learner, based on their profile.
Mix their stated interests with one or two surprising adjacent topics. Match their level.
Reply with JSON only: {"topics": [{"title": string, "prompt": string}]}
"title" is 2 to 6 words. "prompt" is the opening question the learner would send, written in their voice, under 20 words.`;
}
