// Shared shapes for the terminal home. `TuiData` is the JSON in #tui-data that
// Hugo emits (see layouts/partials/tui-shell.html); `Route` is the router's
// state descriptor (also stored in history.state).

export interface Post {
  slug: string;
  date: string;
  title: string;
  url: string;
  contentUrl: string;
}

export interface TuiData {
  posts: Post[];
  postsUrl: string;
  homeUrl: string;
  themeUrl: string;
  resumeUrl: string;
  resumeContentUrl: string;
  aboutContentUrl: string;
  gameScriptUrl: string;
  siteTitle: string;
  subtitle: string;
  copyright: string;
}

export type RouteName =
  | 'home' | 'posts' | 'about' | 'help' | 'motd' | 'game' | 'resume' | 'doc' | 'lab';

export interface Route {
  name: RouteName;
  slug?: string;
  depth?: number;
}
