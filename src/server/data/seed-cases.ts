import type { Case } from '../../shared/types';
import { DEFAULT_LABELS } from '../../shared/types';

// 14 seed cases to ensure the game never goes dark.
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
];

/**
 * Get a seed case for a given date index (cycles through all 14 cases).
 */
export function getSeedCase(index: number): SeedCase {
  return SEED_CASES[index % SEED_CASES.length]!;
}

/**
 * Get a seed case for a specific date key.
 * Uses the day-of-year modulo to cycle through cases.
 */
export function getSeedCaseForDate(dateKey: string): SeedCase {
  const y = parseInt(dateKey.slice(0, 4), 10);
  const m = parseInt(dateKey.slice(4, 6), 10) - 1;
  const d = parseInt(dateKey.slice(6, 8), 10);
  const date = new Date(y, m, d);
  const startOfYear = new Date(y, 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
  return getSeedCase(dayOfYear);
}
