import fs from 'node:fs'

const input =
  process.argv[2] ??
  'C:/Users/msidh/.cursor/projects/c-Users-msidh-Documents-Projects-Code-pokemon-draft-simulator/agent-tools/2b29c183-3e07-4d2e-9a8d-27f1afabc4c0.txt'
const output =
  process.argv[3] ??
  'C:/Users/msidh/Documents/Projects & Code/pokemon-draft-simulator/clerk-users-export.csv'

const { users, total } = JSON.parse(fs.readFileSync(input, 'utf8'))

function csvCell(value) {
  const s = String(value ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

const header =
  'email,first_name,last_name,username,created_at,last_sign_in_at,clerk_user_id'
const rows = users.map((u) => {
  const parts = (u.name ?? '').split(' ').filter(Boolean)
  const first = parts[0] ?? ''
  const last = parts.slice(1).join(' ')
  return [
    u.email,
    first,
    last,
    u.username,
    u.created,
    u.lastSignIn ?? '',
    u.id,
  ]
    .map(csvCell)
    .join(',')
})

fs.writeFileSync(output, `${header}\n${rows.join('\n')}`)
console.log(`Exported ${total} users to ${output}`)
