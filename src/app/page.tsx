import { Chat } from './chat';

export default function Home() {
  return (
    <main className="shell">
      <header className="top">
        <div>
          <h1>PlacidWay Assistant</h1>
          <p>Answers come only from PlacidWay pages about ITC Immunity Therapy Center, with a link to each source.</p>
        </div>
      </header>
      <Chat />
    </main>
  );
}
