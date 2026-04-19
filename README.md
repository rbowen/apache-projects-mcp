# apache-projects-mcp

MCP server for querying Apache Software Foundation project data from [projects.apache.org/json/](https://projects.apache.org/json/) and [Whimsy public JSON](https://whimsy.apache.org/public/).

## Data Sources

Data is fetched from `https://projects.apache.org/json/foundation/` and `https://whimsy.apache.org/public/`, then cached for 6 hours:

| File | Description |
|------|-------------|
| `committees.json` | All TLP committees — roster, chair, charter, homepage |
| `people.json` | All ASF committers — groups, member status |
| `people_name.json` | Apache ID → full name mapping |
| `groups.json` | LDAP groups — committer and PMC membership lists |
| `public_ldap_projects.json` | Whimsy LDAP project entries — `members` for committers and `owners` for PMC/PPMC members |
| `podlings.json` | Current Incubator podlings |
| `releases.json` | Release history per project |
| `repositories.json` | Source code repository URLs |

## Tools

| Tool | Description |
|------|-------------|
| `list_committees` | Browse/search PMCs and podlings by name, description, or charter |
| `get_committee` | Full PMC or podling detail: roster, chair, charter, homepage |
| `search_people` | Find committers by Apache ID or name |
| `get_person` | Full detail on a person: groups, PMC memberships, member status |
| `list_podlings` | Current incubating projects |
| `get_releases` | Release history for a project |
| `get_group_members` | List members of an LDAP group (committer or PMC) |
| `get_repositories` | Find repos for a project |
| `search_projects` | Unified search across TLPs and podlings |
| `project_stats` | ASF-wide summary statistics |

## Setup

```bash
cd ~/devel/apache-projects-mcp
npm install
```

## Usage (stdio)

```bash
node index.js
```

## Amazon Quick Configuration

Add to your MCP server config:

```json
{
  "command": "node",
  "args": ["/Users/rcbowen/devel/apache-projects-mcp/index.js"]
}
```
