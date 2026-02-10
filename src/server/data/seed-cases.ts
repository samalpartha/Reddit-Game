import type { Case } from '../../shared/types';
import { DEFAULT_LABELS } from '../../shared/types';

// 32 seed cases to ensure the game never goes dark.
// Each case is a moral/social dilemma designed for Reddit-style debate.

interface SeedCase {
  title: string;
  text: string;
  labels: [string, string, string, string];
}

export const SEED_CASES: SeedCase[] = [
  {
    title: 'The Loud Neighbor',
    text: "Your neighbor plays loud music every night until 2am. You've asked them nicely three times and they keep doing it. Last night you finally called the police non-emergency line. Your other neighbors say you overreacted and should have just bought earplugs. Were you right to call?",
    labels: ['Right Call', 'Overreaction', 'Depends on Context', 'Both Wrong'],
  },
  {
    title: "The Friend's Alibi",
    text: "Your best friend asks you to tell their partner they were with you last night. They say it's completely innocent but won't explain why they need the cover story. You've known them for 10 years and they've never asked anything like this before. What do you do?",
    labels: ['Cover for Them', 'Tell the Truth', 'Stay Out of It', 'Confront the Friend'],
  },
  {
    title: 'The Found Wallet',
    text: "You find a wallet on the street with $800 cash, credit cards, and an ID. The address on the ID is 45 minutes away. The nearest police station is closed for the weekend. There's no phone number. You're running late for something important.",
    labels: ['Return Everything', 'Mail It Later', 'Turn In to Store', 'Keep Cash, Return Rest'],
  },
  {
    title: 'The Stolen Credit',
    text: "You spent three weeks on a project idea and shared it casually with a coworker. In the next team meeting, they present YOUR idea as their own and the boss loves it. They get assigned to lead it. They later say 'ideas are cheap, execution matters.' Do you speak up?",
    labels: ['Speak Up Publicly', 'Talk to Boss Privately', 'Confront Coworker', 'Let It Go'],
  },
  {
    title: 'The Wedding Dilemma',
    text: "Your sibling is getting married and insists on a child-free wedding. Your cousin just found out and is furious because she has a 2-year-old and no babysitter options. She says she'll skip the wedding entirely. Your sibling asks you to convince her to come without the kid.",
    labels: ["Sibling's Right", "Cousin's Right", 'Find a Compromise', "Everyone's Overreacting"],
  },
  {
    title: 'The Tipping Debate',
    text: "You're at a sit-down restaurant where the service was genuinely terrible. Wrong orders twice, 40-minute wait for drinks, server was on their phone. The bill is $120. Your friend tips 20% and says 'they probably had a bad day.' You were going to leave 5%. Who's right?",
    labels: ['Tip Normal (20%)', 'Low Tip (5-10%)', 'No Tip Justified', 'Speak to Manager Instead'],
  },
  {
    title: 'The Parking Spot',
    text: "You've been waiting 5 minutes with your blinker on for a parking spot at a crowded mall. As the car pulls out, someone zooms in from the other direction and takes it. When you confront them, they say 'I didn't see you waiting.' There are no other spots. What's the move?",
    labels: ['Demand the Spot', 'Let It Go', 'Get Security', 'Wait Them Out'],
  },
  {
    title: 'The Group Project',
    text: "You're in a college group project. One member hasn't contributed anything in 3 weeks despite multiple messages. The deadline is in 2 days. They just texted saying they had 'personal stuff' going on and will help now. The rest of the group wants to report them to the professor.",
    labels: ['Report Them', 'Give Them a Chance', 'Split the Grade', 'Do It Without Them'],
  },
  {
    title: "The Pet's Vet Bill",
    text: "Your roommate's dog ate your expensive headphones ($300). Your roommate says it's partly your fault for leaving them out. The dog also needs a $500 vet visit now because of the incident. Your roommate wants to split ALL costs 50/50. You think they should pay for your headphones and you'll split the vet bill.",
    labels: ['Split Everything', 'They Pay Headphones', 'Each Pay Own', '50/50 Only Vet'],
  },
  {
    title: 'The Secret Recipe',
    text: "You run a small home bakery. A friend asks for your signature cookie recipe that took years to develop. When you politely decline, they say 'real friends share' and accuse you of being selfish. They've helped you move twice and dog-sat for free. Do you owe them the recipe?",
    labels: ['Share the Recipe', 'Keep It Secret', 'Share a Modified Version', 'Offer Free Cookies Instead'],
  },
  {
    title: 'The Plane Seat',
    text: "You paid extra to reserve a window seat on a 6-hour flight. When you board, a parent with a toddler asks if you'll switch to their middle seat 10 rows back so they can sit together. The flight attendant says it's your choice. Other passengers are watching.",
    labels: ['Switch Seats', 'Keep Your Seat', 'Only Switch for Equal Seat', 'Ask Airline to Help'],
  },
  {
    title: 'The Promotion',
    text: "You and your work friend both applied for the same promotion. You got it. They haven't spoken to you in two weeks and have been visibly cold in meetings. A mutual coworker says they feel betrayed that you didn't tell them you were applying. Were you obligated to tell them?",
    labels: ['Should Have Told Them', 'No Obligation', 'They Should Be Happy', 'Both Could Communicate Better'],
  },
  {
    title: 'The Family Dinner Bill',
    text: "At a family dinner, your uncle orders the most expensive items (lobster, premium steak, three cocktails). His tab alone is $180. Everyone else ordered modestly ($30-50 each). At the end, he suggests splitting the bill evenly. When you object, he says 'family doesn't nickel and dime.'",
    labels: ['Split Evenly', 'Pay Your Own', 'Uncle Pays Extra', 'Confront Uncle'],
  },
  {
    title: 'The Gym Confrontation',
    text: "Someone at your gym has been using a machine for 45 minutes during peak hours, mostly scrolling their phone between sets. You politely ask to work in and they say they have 'two more sets.' Twenty minutes later they're still there. The gym has a 30-minute limit sign posted.",
    labels: ['Get Staff Involved', 'Wait Patiently', 'Ask Again Firmly', 'Find Another Machine'],
  },
  // ─── New Cases: Reddit Culture ─────────────────────────────────────────
  {
    title: 'The Repost Callout',
    text: "You see a post on a subreddit that's clearly a repost from last week. It already has 500 upvotes. You check the original poster and they're different from the current one. Do you call them out in the comments, report it to mods, let it be since people are enjoying it, or downvote and move on?",
    labels: ['Call Out in Comments', 'Report to Mods', 'Let People Enjoy It', 'Downvote and Move On'],
  },
  {
    title: 'The Surprise Inheritance',
    text: "Your grandmother left $100,000 split equally among 4 grandchildren. Your cousin (who visited her every week for 10 years) says the split is unfair because the rest of you rarely visited. She wants 40% and the rest split 20% each. She did handle all her care.",
    labels: ['Equal Split Is Fair', "Cousin Deserves More", 'Compromise at 30/23/23/23', 'Respect the Will Exactly'],
  },
  {
    title: 'The Social Media Ghost',
    text: "You've been dating someone for 3 months. Everything seems great in person, but you notice they haven't posted anything about you on social media. Meanwhile, they post about friends, food, and trips constantly. When you bring it up, they say 'I keep my love life private.' Is that a red flag?",
    labels: ['Totally Fine', 'Definitely a Red Flag', 'Slightly Suspicious', 'They Should Compromise'],
  },
  {
    title: 'The Rescue Dog Debate',
    text: "Your friend spent $3,000 buying a designer breed dog from a breeder. You mentioned that shelters are full of dogs that need homes. They got upset and said it's their money and they wanted a specific breed for allergy reasons. Now there's tension.",
    labels: ['Their Money, Their Choice', "Should've Adopted", 'Allergies Justify It', "Shouldn't Have Said Anything"],
  },
  {
    title: 'The WFH Spy',
    text: "Your company just installed monitoring software on all WFH laptops that tracks keystrokes, screenshots, and mouse movement. Your manager says it's 'for productivity metrics.' Some colleagues are furious, others say 'if you're working, what's the problem?' You have to decide whether to speak up.",
    labels: ['Totally Unacceptable', "It's Reasonable", 'Depends on Implementation', 'Time to Find a New Job'],
  },
  {
    title: 'The Birthday Party Snub',
    text: "Your friend is having a birthday dinner at an expensive restaurant ($80+ per person). You can't afford it but don't want to say so. When you say you can't make it, they say 'I only turn 30 once' and guilt-trip you. Another friend offers to cover your meal, but that feels embarrassing.",
    labels: ['Go, Accept the Help', 'Be Honest About Money', "Skip It, It's OK", 'Suggest a Cheaper Alternative'],
  },
  {
    title: 'The Vacation Photo Ethics',
    text: "You're on vacation and take a group photo with friends. One friend looks terrible in the photo. Everyone else looks great. You want to post it. When you ask, they say 'please don't post it.' But it's the only group photo from the whole trip.",
    labels: ['Respect Their Wish', 'Post It Anyway', 'Crop or Edit Them', 'Ask the Group to Vote'],
  },
  {
    title: 'The Nosy Coworker',
    text: "A coworker keeps asking about your salary during casual conversation. Company policy doesn't prohibit sharing, and salary transparency is legal. But you make significantly more than them (same role, you negotiated harder). Sharing could cause drama but help them negotiate.",
    labels: ['Share Openly', 'Deflect Politely', 'Share Privately', 'Redirect to HR'],
  },
  {
    title: 'The Roommate Thermostat War',
    text: "You and your roommate constantly fight about the thermostat. You run hot and want AC at 68°F. They're always cold and want heat at 74°F. You split utilities evenly. Last month, the electric bill was $280. They secretly changed the thermostat while you were at work.",
    labels: ['68 Is Reasonable', '74 Is Reasonable', 'Split the Difference (71)', 'Get Separate Heaters/Fans'],
  },
  {
    title: 'The Late-Night Text',
    text: "Your ex texts you at 2am saying they miss you and made a mistake. You've been in a new relationship for 4 months and things are going well. You haven't told your current partner about the text yet. Your ex wants to meet for coffee 'just to talk.'",
    labels: ['Ignore Completely', 'Meet for Coffee', 'Tell Current Partner First', 'Reply but No Meeting'],
  },
  {
    title: 'The Queue Jumper',
    text: "You've been in a long line at a popular food truck for 25 minutes. Someone walks up to a friend near the front and starts chatting, then casually places an order with them. Nobody else in line says anything. You're 3 spots behind them.",
    labels: ['Call Them Out', "Not Worth the Drama", 'Tell the Server', 'Loudly Comment So They Hear'],
  },
  {
    title: 'The AI Art Controversy',
    text: "Your friend entered an art contest and won first place using an AI-generated image they slightly edited. The rules didn't explicitly ban AI art. Other artists who spent weeks on their pieces are furious. Your friend says 'the prompt and editing IS the art.' Was it wrong?",
    labels: ['Totally Wrong', 'Fair Game', "Wrong but Rules Allow It", 'Art Is Evolving'],
  },
  {
    title: 'The Student Loan Gift',
    text: "Your parents paid off your sibling's $50K student loans as a 'graduation gift.' When you graduated (same degree, same school), they said they can't afford to do the same for you because the economy changed. Your sibling thinks you should just deal with it.",
    labels: ['Parents Should Be Fair', 'Life Isn\'t Always Fair', 'Parents Owe You Too', 'Sibling Should Help'],
  },
  {
    title: 'The Potluck Freeloader',
    text: "Your friend group does monthly potlucks. One person always brings a bag of chips while everyone else cooks elaborate dishes. They eat everything but never put in effort. When someone finally mentioned it, they said 'I can't cook and chips are a valid contribution.'",
    labels: ['Chips Are Fine', 'Put in More Effort', 'Assign Dishes Next Time', "Don't Invite Them"],
  },
  {
    title: 'The Gaming Rage Quit',
    text: "You're playing a competitive team game online. Your teammate makes a costly mistake in a ranked match that loses the game. In voice chat, another teammate absolutely tears into them with insults. The person who made the mistake is clearly upset. Do you say something?",
    labels: ['Defend the Player', 'Stay Silent', 'Tell Rager to Chill', 'Report and Mute'],
  },
  {
    title: 'The Subscription Trap',
    text: "You discover your friend has been sharing your streaming account password with 5 other people without asking. Your service is slow now and you got a warning from the platform. When you confronted them, they said 'you weren't even using it that much.'",
    labels: ['Change Password Now', 'Let It Slide', 'Ask Them to Split Cost', 'Confront and Set Rules'],
  },
  {
    title: 'The Elevator Pitch',
    text: "You're in an elevator. Someone sneezes loudly without covering their mouth. Another person says 'that's disgusting.' The sneezer says 'I have allergies, it came out of nowhere.' The commenter doubles down: 'still should cover your mouth.' Whose side are you on?",
    labels: ['Sneezer Should Cover', 'It Was Involuntary', 'Commenter Was Rude', 'Both Were Wrong'],
  },
  {
    title: 'The Used Car Dilemma',
    text: "You're selling your car privately. You know there's a small engine issue that only shows up occasionally. It passed inspection. The buyer seems really excited and mentions it's for their teenager's first car. Do you disclose the intermittent issue?",
    labels: ['Must Disclose', 'Passed Inspection, Fine', 'Offer a Discount Instead', 'Depends on Severity'],
  },
];

/**
 * Get a seed case for a given date index (cycles through all cases).
 */
export function getSeedCase(index: number): SeedCase {
  return SEED_CASES[index % SEED_CASES.length]!;
}

/**
 * Get a seed case for a specific cycle key.
 * Cycle keys are YYYYMMDDHH (10 chars) or YYYYMMDD (8 chars legacy).
 * Uses day-of-year * 12 + hourSlot to cycle through all cases across 2-hour rounds.
 */
export function getSeedCaseForDate(dateKey: string): SeedCase {
  const y = parseInt(dateKey.slice(0, 4), 10);
  const m = parseInt(dateKey.slice(4, 6), 10) - 1;
  const d = parseInt(dateKey.slice(6, 8), 10);
  const h = dateKey.length >= 10 ? parseInt(dateKey.slice(8, 10), 10) : 0;
  const date = new Date(y, m, d);
  const startOfYear = new Date(y, 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
  const hourSlot = Math.floor(h / 2); // 0..11
  const index = dayOfYear * 12 + hourSlot;
  return getSeedCase(index);
}
