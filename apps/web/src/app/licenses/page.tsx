import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Licenses · Adaptive Chess Coach' };

export default function LicensesPage() {
  return (
    <article className="prose">
      <h1>Open-source licenses</h1>

      <h2>Stockfish</h2>
      <p>
        The computer opponent is <strong>Stockfish 19</strong>, a free and open-source chess engine by the Stockfish
        developers, in the WebAssembly build <em>stockfish.js</em> by Nathan Rugg / Chess.com. It runs as a separate
        program inside your browser and the app talks to it with the standard UCI text protocol.
      </p>
      <p>
        Stockfish and stockfish.js are licensed under the{' '}
        <a href="/engine/Copying.txt">GNU General Public License, version 3</a>. You may redistribute and modify them
        under that license. The complete corresponding source code is available here:
      </p>
      <ul>
        <li>
          <a href="https://github.com/nmrugg/stockfish.js/tree/v19.0.0">stockfish.js v19.0.0 source</a> (the exact build
          distributed by this site: <code>stockfish-19-lite-single</code>)
        </li>
        <li>
          <a href="https://github.com/official-stockfish/Stockfish">Stockfish upstream source</a>
        </li>
      </ul>

      <h2>Other components</h2>
      <ul>
        <li>
          <a href="https://github.com/jhlywa/chess.js">chess.js</a> — BSD 2-Clause License
        </li>
        <li>
          <a href="https://github.com/Clariity/react-chessboard">react-chessboard</a> — MIT License
        </li>
        <li>
          <a href="https://github.com/vercel/next.js">Next.js</a> and <a href="https://github.com/facebook/react">React</a> — MIT
          License
        </li>
      </ul>
    </article>
  );
}
