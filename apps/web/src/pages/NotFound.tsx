import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-5xl font-extrabold">Lost in orbit</h1>
      <p className="mt-3 text-mist">That page does not exist. Head back and start a party instead.</p>
      <Link to="/" className="btn btn-primary mt-6">Go home</Link>
    </div>
  );
}
