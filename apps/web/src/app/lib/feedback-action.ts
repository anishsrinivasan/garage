"use server";

import { db, feedback } from "@preowned-cars/db";

export async function submitFeedback(data: {
  category: string;
  rating: number;
  message: string;
}) {
  await db.insert(feedback).values({
    category: data.category,
    rating: data.rating || null,
    message: data.message.trim(),
  });
}
