import { Octokit } from '@octokit/rest';
import { decryptSecret } from './security.js';

const cache = new Map();
const CACHE_TTL_MS = 60_000;

export function createGitHubClient(encryptedToken, encryptionKey) {
  const token = decryptSecret(encryptedToken, encryptionKey);
  return new Octokit({
    auth: token,
    userAgent: 'RAVS-Developer-Dashboard/1.0.0',
  });
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

function repoSummary(repo) {
  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    url: repo.html_url,
    description: repo.description,
    language: repo.language,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    openIssues: repo.open_issues_count,
    visibility: repo.visibility,
    defaultBranch: repo.default_branch,
    updatedAt: repo.updated_at,
    pushedAt: repo.pushed_at,
    archived: repo.archived,
    fork: repo.fork,
    topics: repo.topics ?? [],
  };
}

export async function loadDashboard(octokit, login) {
  const cacheKey = `dashboard:${login}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const [profileResponse, repositories] = await Promise.all([
    octokit.rest.users.getByUsername({ username: login }),
    octokit.paginate(octokit.rest.repos.listForUser, {
      username: login,
      type: 'owner',
      sort: 'updated',
      direction: 'desc',
      per_page: 100,
    }),
  ]);

  const profile = profileResponse.data;
  const repos = repositories.map(repoSummary);
  const languageCounts = new Map();
  for (const repo of repos) {
    if (repo.language) languageCounts.set(repo.language, (languageCounts.get(repo.language) ?? 0) + 1);
  }

  const result = {
    user: {
      login: profile.login,
      name: profile.name,
      avatarUrl: profile.avatar_url,
      htmlUrl: profile.html_url,
      bio: profile.bio,
      company: profile.company,
      location: profile.location,
      blog: profile.blog,
      followers: profile.followers,
      following: profile.following,
      publicRepos: profile.public_repos,
      createdAt: profile.created_at,
    },
    stats: {
      repositories: repos.length,
      stars: repos.reduce((sum, repo) => sum + (repo.stars ?? 0), 0),
      forks: repos.reduce((sum, repo) => sum + (repo.forks ?? 0), 0),
      followers: profile.followers ?? 0,
      openIssues: repos.reduce((sum, repo) => sum + (repo.openIssues ?? 0), 0),
    },
    languages: [...languageCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 7),
    repositories: repos.slice(0, 100),
    refreshedAt: new Date().toISOString(),
  };

  return setCached(cacheKey, result);
}

export async function loadPullRequests(octokit, login) {
  const key = `pulls:${login}`;
  const cached = getCached(key);
  if (cached) return cached;
  const { data } = await octokit.rest.search.issuesAndPullRequests({
    q: `is:pr author:${login}`,
    sort: 'updated',
    order: 'desc',
    per_page: 20,
  });
  const result = data.items.map((item) => ({
    id: item.id,
    number: item.number,
    title: item.title,
    state: item.state,
    draft: Boolean(item.draft),
    url: item.html_url,
    repository: item.repository_url?.replace('https://api.github.com/repos/', '') ?? 'Repository',
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    comments: item.comments,
    labels: (item.labels ?? []).map((label) => typeof label === 'string' ? label : label.name),
  }));
  return setCached(key, result);
}

export async function loadWorkflowRuns(octokit, repositories) {
  const key = `actions:${repositories.map((repo) => repo.fullName).join(',')}`;
  const cached = getCached(key);
  if (cached) return cached;
  const targets = repositories.slice(0, 10);
  const batches = await Promise.allSettled(targets.map((repo) =>
    octokit.rest.actions.listWorkflowRunsForRepo({
      owner: repo.fullName.split('/')[0],
      repo: repo.name,
      per_page: 5,
    }),
  ));
  const result = batches.flatMap((batch) => batch.status === 'fulfilled'
    ? batch.value.data.workflow_runs.map((run) => ({
      id: run.id,
      name: run.name || run.display_title || 'Workflow run',
      workflow: run.workflow_id,
      status: run.status,
      conclusion: run.conclusion,
      branch: run.head_branch,
      event: run.event,
      url: run.html_url,
      repository: run.repository?.full_name ?? 'Repository',
      createdAt: run.created_at,
      updatedAt: run.updated_at,
    }))
    : []);
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return setCached(key, result.slice(0, 20));
}

export async function loadReleases(octokit, repositories) {
  const key = `releases:${repositories.map((repo) => repo.fullName).join(',')}`;
  const cached = getCached(key);
  if (cached) return cached;
  const targets = repositories.slice(0, 12);
  const batches = await Promise.allSettled(targets.map((repo) =>
    octokit.rest.repos.listReleases({
      owner: repo.fullName.split('/')[0],
      repo: repo.name,
      per_page: 3,
    }),
  ));
  const result = batches.flatMap((batch, index) => batch.status === 'fulfilled'
    ? batch.value.data.map((release) => ({
      id: release.id,
      name: release.name || release.tag_name,
      tag: release.tag_name,
      url: release.html_url,
      draft: release.draft,
      prerelease: release.prerelease,
      publishedAt: release.published_at,
      repository: targets[index].fullName,
    }))
    : []);
  result.sort((a, b) => new Date(b.publishedAt ?? 0) - new Date(a.publishedAt ?? 0));
  return setCached(key, result.slice(0, 24));
}
