import { getCardComments, getCards } from '/home/munix/Desarrollo/GitRepo/Vibes/scripts/trello/lib.mjs';
const cards = await getCards();
const c = cards.find(x => x.idShort === 232);
console.log('=== DESC ===');
console.log(c?.desc || '(sin desc)');
console.log('\n=== COMMENTS ===');
const comments = await getCardComments(c.id);
for (const com of comments) {
  console.log(`\n--- ${com.date} ---`);
  console.log(com.text);
}
