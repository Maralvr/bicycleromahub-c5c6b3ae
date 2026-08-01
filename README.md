# Shift Savvy

build something that would replace connecteam for a tour operator, they specefically need the following features: Staff Records and AvailabilityThis is the essential database so the AI knows who can work and when.Profiles and Tags: Every staff member must have a digital profile. Specific skills, licenses, spoken languages, or qualifications (e.g., guide for specific tours or rental staff) must be managed using tags or roles. The AI will use these tags during the assignment phase to automatically filter only the personnel suitable for the requested service.Unavailability Management: Staff must be able to enter their unavailability directly into the app. The system must accommodate both full block-out days and specific time slots when the person is already in-service or unavailable. The AI will need to cross-reference this data to prevent overlaps or double bookings.Shift Creation and Synchronization with BOKUNThis is the operational engine, where bookings turn into work shifts.Bokun Tour Integration: The primary goal is automation. Every time a booking comes into Bokun, the AI should intercept the data (e.g., via API) and initiate guide assignments, suggesting the best profiles based on tags and availability.Comprehensive Shift Details: Each created shift must contain a precise set of data mapped directly from Bokun: date, time, type of work, tour/event name, meeting point, and assigned staff. It must also include customer details (booking ID, name, phone number), the exact breakdown of participants (number of adults, teens, trailers, infants), the rate extracted from the booking, and a dedicated space for operational notes.Rental Staff Assignment and Manual Creation: For activities not stemming from standard tours (such as rental desk duty), the system must allow for manual shift creation. It will be crucial to include a quick shift duplication feature so admins can easily replicate the weekly schedule.Staff Interaction with ShiftsThis phase manages the acceptance of work by the team.Accept or Reject: When the system (or the admin) assigns a shift, the guide will receive a notification. The app must require an explicit action: accept or reject the shift. Until accepted, the system will keep the shift as "pending," and the AI can be trained to alert the administrator if a shift risks remaining uncovered close to the event.Field Operations and CommunicationsEssential tools for managing unforeseen events and daily micro-tasks.Task Management: For activities unrelated to specific tour schedules (e.g., checking vehicle tire pressure, setting up the meeting point), the app must integrate a Task system. Staff will be able to check off individual items once completed, providing real-time reporting to management.Real-Time Notifications and Updates: The application must have a fast, two-way communication channel. Administrators will be able to send push notifications to the entire team, while guides on the ground must have a way to send field updates (e.g., reporting road works, closed streets, or meeting point changes), alerting all involved staff in real-time.
here's the logo and brand colors

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://bicycleromahub.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d10b7846-1048-4145-87e5-4eabec45c97d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
