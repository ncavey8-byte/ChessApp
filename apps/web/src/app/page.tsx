import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="home">
      <section className="hero">
        <h1>Train smarter. Play better chess.</h1>
        <p className="lead">
          Play complete games against Stockfish at a level that suits you. Game analysis, plain-language coaching and
          personalised practice are on the way.
        </p>
        <Link href="/play" className="btn btn-primary btn-lg">
          Play the computer
        </Link>
      </section>
      <section className="feature-grid" aria-label="Features">
        <div className="feature">
          <h2>Play</h2>
          <p>Full rules including castling, en passant and promotion. Six opponent levels, undo in practice games.</p>
          <span className="badge badge-live">Available</span>
        </div>
        <div className="feature">
          <h2>Analyse</h2>
          <p>Move-by-move engine review that highlights the moments that really mattered.</p>
          <span className="badge">Coming soon</span>
        </div>
        <div className="feature">
          <h2>Coach & practise</h2>
          <p>Explanations grounded in engine results, and exercises built from your own mistakes.</p>
          <span className="badge">Coming soon</span>
        </div>
      </section>
    </div>
  );
}
