"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_NAME_LENGTH = 80;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export type ProfileFormData = {
  firstName: string;
  lastName: string;
  signedPhotoUrl: string | null;
};

type ProfileFormProps = {
  initialProfile: ProfileFormData;
};

export function ProfileForm({ initialProfile }: ProfileFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState(initialProfile.firstName);
  const [lastName, setLastName] = useState(initialProfile.lastName);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState(initialProfile.signedPhotoUrl);
  const [hasSavedPhoto, setHasSavedPhoto] = useState(Boolean(initialProfile.signedPhotoUrl));
  const [deletePhoto, setDeletePhoto] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);

  function validateName(value: string, label: string) {
    const trimmed = value.trim();

    if (!trimmed) {
      return `${label} is required.`;
    }

    if (trimmed.length > MAX_NAME_LENGTH) {
      return `${label} must be ${MAX_NAME_LENGTH} characters or fewer.`;
    }

    return "";
  }

  function validatePhoto(file: File | null) {
    if (!file) {
      return "";
    }

    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      return "Photo must be a PNG, JPG, WEBP, or GIF file.";
    }

    if (file.size > MAX_PHOTO_BYTES) {
      return "Photo must be 5 MB or smaller.";
    }

    return "";
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const nextPhoto = event.target.files?.[0] ?? null;
    const photoError = validatePhoto(nextPhoto);

    setPhoto(nextPhoto);
    setDeletePhoto(false);
    setError(photoError);
    setSuccess("");

    if (!nextPhoto || photoError) {
      setPhotoPreview(initialProfile.signedPhotoUrl);
      return;
    }

    setPhotoPreview(URL.createObjectURL(nextPhoto));
  }

  async function handleDeletePhoto() {
    setError("");
    setSuccess("");

    if (!hasSavedPhoto) {
      setPhoto(null);
      setPhotoPreview(null);
      setDeletePhoto(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      return;
    }

    setIsDeletingPhoto(true);

    const response = await fetch("/api/profile/photo", {
      method: "DELETE",
    });
    const result = (await response.json()) as {
      error?: string;
      message?: string;
    };

    setIsDeletingPhoto(false);

    if (!response.ok) {
      setError(result.error ?? "Photo could not be deleted.");
      return;
    }

    setPhoto(null);
    setPhotoPreview(null);
    setHasSavedPhoto(false);
    setDeletePhoto(false);
    setSuccess(result.message ?? "Photo deleted.");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const firstNameError = validateName(firstName, "First name");
    const lastNameError = validateName(lastName, "Last name");
    const photoError = validatePhoto(photo);
    const validationError = firstNameError || lastNameError || photoError;

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);

    const formData = new FormData();
    formData.set("first_name", firstName);
    formData.set("last_name", lastName);

    if (photo) {
      formData.set("photo", photo);
    }

    if (deletePhoto) {
      formData.set("delete_photo", "true");
    }

    const response = await fetch("/api/profile", {
      method: "POST",
      body: formData,
    });

    const result = (await response.json()) as {
      error?: string;
      message?: string;
    };

    setIsSaving(false);

    if (!response.ok) {
      setError(result.error ?? "Profile could not be saved.");
      return;
    }

    setPhoto(null);
    setDeletePhoto(false);
    setHasSavedPhoto(Boolean(photo) || (hasSavedPhoto && !deletePhoto));
    setSuccess(result.message ?? "Profile saved.");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 text-sm text-zinc-500">
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoPreview} alt="" className="h-full w-full object-cover" />
          ) : (
            "No photo"
          )}
        </div>
        <label className="block min-w-0 flex-1 space-y-2 text-sm font-medium text-zinc-800">
          <span>Photo Optional</span>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_PHOTO_TYPES.join(",")}
            onChange={handlePhotoChange}
            className="block w-full text-sm text-zinc-700 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800"
          />
          {photoPreview ? (
            <button
              type="button"
              onClick={handleDeletePhoto}
              disabled={isDeletingPhoto}
              className="block text-sm font-medium text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:text-red-300"
            >
              {isDeletingPhoto ? "Deleting..." : "Delete Photo"}
            </button>
          ) : null}
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-zinc-800">
          <span>First Name</span>
          <input
            value={firstName}
            maxLength={MAX_NAME_LENGTH}
            onChange={(event) => setFirstName(event.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-950"
            autoComplete="given-name"
          />
        </label>

        <label className="space-y-2 text-sm font-medium text-zinc-800">
          <span>Last Name</span>
          <input
            value={lastName}
            maxLength={MAX_NAME_LENGTH}
            onChange={(event) => setLastName(event.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-950"
            autoComplete="family-name"
          />
        </label>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSaving}
        className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {isSaving ? "Saving..." : "Save Profile"}
      </button>
    </form>
  );
}
