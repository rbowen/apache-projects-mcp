# apache-projects-mcp

MCP server for querying Apache Software Foundation project data from [projects.apache.org/json/](https://projects.apache.org/json/) and [Whimsy public JSON](https://whimsy.apache.org/public/).

This server provides a simple way for MCP clients to explore ASF committees, people, podlings, releases, LDAP groups, and repositories using data published by the ASF.

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

## Available tools

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

## Requirements

- Node.js 18 or later  
- An MCP-compatible client  

## Installation

Clone the repository and install dependencies:

```
git clone https://github.com/rbowen/apache-projects-mcp.git
cd apache-projects-mcp
npm install
```

## Running the server

Run the server over stdio:

```
npm start
```

You can also run it directly:

```
node index.js
```

## Example MCP client configuration

Example stdio configuration:

```
{
  "command": "node",
  "args": ["/Users/yourname/apache-projects-mcp/index.js"]
}
```

Adjust the path to match your local checkout.

## Example questions

Once configured in an MCP client, you can ask things like:

- “List projects related to data or storage”  
- “Show me the PMC roster for Iceberg”  
- “Find ASF committers named Justin”  
- “What releases has Apache Spark had recently?”  
- “Which repositories match Kafka?”  
- “Search Apache projects related to security”  

## Notes and limitations

- Data comes from `projects.apache.org/json`, not directly from Git repositories, mailing lists, or podling status reports.  
- Podling data is limited to the current contents of `podlings.json`.  
- Data is cached for 6 hours in memory, so updates on the source side may not appear immediately.  