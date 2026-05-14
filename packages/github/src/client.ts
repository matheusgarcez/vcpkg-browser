import { Octokit } from "octokit";

let _octokit: Octokit | null = null;

export function createGitHubClient(token?: string): Octokit {
  _octokit = new Octokit(token ? { auth: token } : undefined);
  return _octokit;
}

export function getClient(): Octokit {
  if (!_octokit) throw new Error("GitHub client not initialized");
  return _octokit;
}
