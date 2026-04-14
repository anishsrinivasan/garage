export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">404 — Not Found</h1>
      <p className="mt-2 text-gray-500">The page you are looking for does not exist.</p>
      <a href="/" className="mt-4 inline-block text-blue-600 hover:underline">
        Go back to listings
      </a>
    </div>
  );
}
