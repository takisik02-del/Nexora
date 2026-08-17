// Simulate renderTeamBrowser logic
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('C:/Users/Acer/Nexora/test_data.json', 'utf8'));

const pendingTournamentId = 1;
const teamType = (data.nexora_tournaments.find(t => t.id === pendingTournamentId) || {}).teamType;
const memberCount = teamType === 'duo' ? 2 : teamType === 'trio' ? 3 : teamType === 'team4' ? 4 : teamType === 'team8' ? 8 : 5;
const regs = data.nexora_registrations || [];

console.log('=== DEBUG ===');
console.log('Tournament teamType:', teamType);
console.log('memberCount:', memberCount);
console.log('Total registrations:', regs.length);
console.log('Registrations JSON:', JSON.stringify(regs, null, 2));
console.log('');

const captains = regs.filter(r => r.tournamentId === pendingTournamentId && r.role === 'captain');
console.log('Captains found:', captains.length);

if (captains.length === 0) {
  console.log('NO CAPTAINS FOUND!');
  console.log('All registrations roles:', regs.map(r => ({userId: r.userId, role: r.role, tournamentId: r.tournamentId})));
} else {
  captains.forEach(cap => {
    const members = regs.filter(r => r.teamId === cap.teamId && r.role === 'member');
    const total = 1 + members.length;
    console.log(`${cap.teamName}: ${total}/${memberCount} (role: ${cap.role}, teamId: ${cap.teamId})`);
    if (total >= memberCount) {
      console.log(`  -> TEAM FULL, not shown`);
    } else {
      console.log(`  -> Has space! WILL BE SHOWN`);
    }
  });
}
