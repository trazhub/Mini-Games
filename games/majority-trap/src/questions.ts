export interface Question {
  id: string;
  text: string;
  a: string;
  b: string;
}

/** Original question content. Add freely - ids only need to be unique. */
export const QUESTIONS: readonly Question[] = [
  { id: 'q01', text: 'Which is the better way to spend a rainy Sunday?', a: 'Blanket fort and movies', b: 'Cafe hopping in the drizzle' },
  { id: 'q02', text: 'Pick a superpower for one week.', a: 'Fly anywhere', b: 'Pause time' },
  { id: 'q03', text: 'Pineapple on pizza is...', a: 'Perfectly fine', b: 'A crime' },
  { id: 'q04', text: 'Which alarm style are you?', a: 'One alarm, instantly up', b: 'Seven snoozes minimum' },
  { id: 'q05', text: 'Group chat etiquette: voice messages are...', a: 'Totally okay', b: 'Please just type' },
  { id: 'q06', text: 'Best season?', a: 'Warm and bright', b: 'Cool and cozy' },
  { id: 'q07', text: 'You find a wallet with cash and an ID. First move?', a: 'Hand it in right away', b: 'Track down the owner yourself' },
  { id: 'q08', text: 'Which sounds worse?', a: 'Phone at 1% all day', b: 'Wi-Fi that drops every minute' },
  { id: 'q09', text: 'Pick one snack forever.', a: 'Salty crunch', b: 'Sweet and chewy' },
  { id: 'q10', text: 'Road trip seat?', a: 'Driver, hands on the wheel', b: 'Passenger, controls the playlist' },
  { id: 'q11', text: 'A talking pet would mostly be...', a: 'Sweet and loyal', b: 'Sarcastic and judgy' },
  { id: 'q12', text: 'Morning or night?', a: 'Early bird', b: 'Night owl' },
  { id: 'q13', text: 'Which skill is more useful?', a: 'Cooking anything', b: 'Fixing anything' },
  { id: 'q14', text: 'Surprise party for you: how do you feel?', a: 'Love it', b: 'Please never' },
  { id: 'q15', text: 'Choose a holiday.', a: 'Mountains and trails', b: 'Beach and nothing' },
  { id: 'q16', text: 'When the movie ends, you...', a: 'Watch every credit', b: 'Leave before the names roll' },
  { id: 'q17', text: 'Texting back: you are...', a: 'Instant replier', b: 'Replies in 3-5 business days' },
  { id: 'q18', text: 'Which is the superior breakfast?', a: 'Pancakes', b: 'Eggs and toast' },
  { id: 'q19', text: 'Share a taxi with...', a: 'A very chatty stranger', b: 'A silent, moody stranger' },
  { id: 'q20', text: 'Lost in a new city. You...', a: 'Ask a local', b: 'Trust the map app' },
  { id: 'q21', text: 'Choose your dream pet.', a: 'A fluffy dog', b: 'An aloof cat' },
  { id: 'q22', text: 'Which would you rather master?', a: 'Every instrument', b: 'Every language' },
  { id: 'q23', text: 'Cold shower in the morning: yes or no?', a: 'Bring it on', b: 'Absolutely not' },
  { id: 'q24', text: 'A board game night usually ends with...', a: 'Friendly laughs', b: 'Table flipping energy' },
  { id: 'q25', text: 'Pick a time to visit.', a: 'Distant future', b: 'Ancient past' },
  { id: 'q26', text: 'The last slice of pizza should go to...', a: 'Whoever asks first', b: 'Whoever is hungriest' },
  { id: 'q27', text: 'Which noise bothers you more?', a: 'Loud chewing', b: 'Scratchy chalk squeak' },
  { id: 'q28', text: 'Pick one: planned trip or spontaneous trip?', a: 'Spreadsheet itinerary', b: 'Wing it entirely' },
  { id: 'q29', text: 'How do you read a book?', a: 'Page by page, no skipping', b: 'Peek at the ending first' },
  { id: 'q30', text: 'Your ideal weekend is...', a: 'Packed with plans', b: 'Totally empty calendar' },
  { id: 'q31', text: 'Dessert or starter, if you only get one?', a: 'Dessert', b: 'Starter' },
  { id: 'q32', text: 'Which sidekick would you pick?', a: 'A tiny dragon', b: 'A pocket-sized robot' },
  { id: 'q33', text: 'Karaoke night. You...', a: 'Grab the mic first', b: 'Clap from the back row' },
  { id: 'q34', text: 'You can only keep one for life.', a: 'Fresh bread', b: 'Fresh coffee' },
  { id: 'q35', text: 'Which is scarier?', a: 'Deep ocean', b: 'Outer space' },
];
