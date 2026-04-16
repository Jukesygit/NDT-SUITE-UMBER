/**
 * ReportHeader — repeating header shown on every page after the cover.
 * Displays report title and metadata (report number, date, vessel).
 */

interface ReportHeaderProps {
    reportTitle: string;
    reportNumber: string | null;
    vesselName: string;
    date: string | null;
}

export default function ReportHeader({
    reportTitle,
    reportNumber,
    vesselName,
    date,
}: ReportHeaderProps) {
    return (
        <div className="report-page-header">
            <div className="report-page-header__title">{reportTitle}</div>
            <div className="report-page-header__meta">
                {reportNumber && <div>Report: {reportNumber}</div>}
                <div>{vesselName}</div>
                {date && <div>{date}</div>}
            </div>
        </div>
    );
}
