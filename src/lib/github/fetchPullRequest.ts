// src/lib/github/fetchPullRequest.ts
type GithubPullRequestResponse = {
  title: string
  body: string | null
  user: { login: string } | null
  labels: { name: string }[]
}

export async function fetchPullRequestDetails(params: {
  token: string
  repoFullName: string // "owner/repo"
  prNumber: number
}) {
  const { token, repoFullName, prNumber } = params

  const url = `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`GitHub API error: ${res.status} ${res.statusText} ${text}`)
  }

  const data = (await res.json()) as GithubPullRequestResponse

  return {
    body: data.body ?? null,
    authorLogin: data.user?.login ?? null,
    labels: data.labels?.map((l) => l.name) ?? [],
  }
}
