import {HrEmployeeRemindersClient} from "./HrEmployeeRemindersClient";
import {parseReminderEntry} from "./employee-reminder-state";

export default async function Page({searchParams}: {searchParams: Promise<{reminder?: string | string[]}>}) {
  const entry = parseReminderEntry((await searchParams).reminder);
  return <HrEmployeeRemindersClient initialReminder={entry.reminderId} invalidEntry={entry.invalid}/>;
}
