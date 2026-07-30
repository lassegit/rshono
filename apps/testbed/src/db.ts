export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

export interface Post {
  id: string;
  title: string;
  excerpt: string;
}

const users: User[] = [
  { id: '1', name: 'Ada Lovelace', email: 'ada@example.com', avatar: '🦉' },
  { id: '2', name: 'Alan Turing', email: 'alan@example.com', avatar: '🤖' },
  { id: '3', name: 'Grace Hopper', email: 'grace@example.com', avatar: '🚢' },
];

const posts: Post[] = [
  { id: 'p1', title: 'On the Origins of Computing', excerpt: 'An exploration into the analytical engine...' },
  { id: 'p2', title: 'Breaking the Code', excerpt: 'How pattern recognition shaped modern...' },
];

export interface Doc {
  slug: string;
  title: string;
  body: string;
}

const docs: Doc[] = [
  { slug: 'getting-started', title: 'Getting Started', body: 'Install, create routes.ts, run the dev server.' },
  { slug: 'deployment', title: 'Deployment', body: 'Run `rs-hono build`, then `rs-hono start` on your server.' },
];

export const fakeDB = {
  async getUser(id: string): Promise<User | undefined> {
    return users.find((u) => u.id === id);
  },

  async listUsers(): Promise<User[]> {
    return users;
  },

  async getUserPosts(_userId: string): Promise<Post[]> {
    return posts;
  },

  async createUser(data: { name: string; email: string }): Promise<User> {
    const user: User = { id: String(users.length + 1), ...data, avatar: '✨' };
    users.push(user);
    return user;
  },

  async listDocs(): Promise<Doc[]> {
    return docs;
  },

  async getDoc(slug: string): Promise<Doc | undefined> {
    return docs.find((d) => d.slug === slug);
  },
};
