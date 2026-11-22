import { httpServerHandler } from 'cloudflare:node';
import { createApp } from './server';

// The Express routes are shared with the Node development server.
// Static frontend assets stay on GitHub Pages.
const app = await createApp();
app.listen(3000);

export default httpServerHandler({ port: 3000 });
