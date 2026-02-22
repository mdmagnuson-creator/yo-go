# Tool Usage

## Code Search

Use the `code_search` MCP tool to discover how projects and services communicate with each other. This is critical for understanding the downstream and upstream consequences of changes.

Before modifying any of the following, run `code_search` to find all affected services:

- API endpoints or request/response schemas
- Event schemas and message formats
- Shared contracts, interfaces, or types
- Inter-service communication (REST calls, queue messages, shared databases)

Do not assume you know the full blast radius of a change. Search first.
