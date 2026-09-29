import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect to Billing POS as default entry point
  redirect('/billing');
}
