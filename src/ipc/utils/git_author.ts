import { getGithubUser } from "../handlers/github_handlers";

export async function getGitAuthor() {
  const user = await getGithubUser();
  const author = user
    ? {
        name: `[vibes]`,
        email: user.email,
      }
    : {
        name: "[vibes]",
        email: "pablo@minube.com",
      };
  return author;
}
