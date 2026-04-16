/**
 * CoverPage — first page of the PAUT inspection report.
 *
 * Displays branded header, project metadata, component details,
 * equipment configuration, beamset configuration, results summary,
 * and sign-off section.
 */

import type {
    InspectionProject,
    ProjectVessel,
    InspectionProcedure,
    BeamsetRow,
    SignoffPerson,
} from '../../types/inspection-project';

interface CoverPageProps {
    project: InspectionProject;
    vessel: ProjectVessel;
    procedures: InspectionProcedure[];
}

function formatDate(iso: string | null): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    } catch {
        return iso;
    }
}

function val(v: string | number | null | undefined): string {
    if (v == null || v === '') return '—';
    return String(v);
}

function SignoffColumn({ title, person }: { title: string; person?: SignoffPerson }) {
    return (
        <div className="report-signoff__col">
            <div className="report-signoff__title">{title}</div>
            <div className="report-signoff__row">
                <span className="report-signoff__label">Name:</span>
                <span>{val(person?.name)}</span>
            </div>
            <div className="report-signoff__row">
                <span className="report-signoff__label">Qualification:</span>
                <span>{val(person?.qualification)}</span>
            </div>
            <div className="report-signoff__row">
                <span className="report-signoff__label">Position:</span>
                <span>{val(person?.position)}</span>
            </div>
            <div className="report-signoff__row">
                <span className="report-signoff__label">Date:</span>
                <span>{val(person?.date)}</span>
            </div>
        </div>
    );
}

export default function CoverPage({ project, vessel, procedures }: CoverPageProps) {
    const procedure = procedures.find((p) => p.id === vessel.procedure_id) ?? procedures[0];
    const equip = vessel.equipment_config;
    const beamset = vessel.beamset_config;
    const signoff = vessel.signoff_details;

    return (
        <div className="report-cover">
            {/* Branded header bar */}
            <div className="report-cover__header">
                <div className="report-cover__header-title">
                    PAUT Inspection Report
                </div>
            </div>

            {/* Project Metadata */}
            <div className="report-section-header">Project Information</div>
            <table className="report-table report-table--pairs">
                <tbody>
                    <tr>
                        <td>Customer</td>
                        <td>{val(project.client_name)}</td>
                        <td>Location</td>
                        <td>{val(project.site_name)}</td>
                    </tr>
                    <tr>
                        <td>Report No.</td>
                        <td>{val(project.report_number)}</td>
                        <td>Project</td>
                        <td>{val(project.name)}</td>
                    </tr>
                    <tr>
                        <td>Contract No.</td>
                        <td>{val(project.contract_number)}</td>
                        <td>W/O No.</td>
                        <td>{val(project.work_order_number)}</td>
                    </tr>
                    <tr>
                        <td>Date</td>
                        <td>{formatDate(project.start_date)}</td>
                        <td>Vessel</td>
                        <td>{val(vessel.vessel_name)}</td>
                    </tr>
                </tbody>
            </table>

            {/* Component Details & Procedure */}
            <div className="report-section-header">Component Details &amp; Procedure</div>
            <table className="report-table report-table--pairs">
                <tbody>
                    <tr>
                        <td>Description</td>
                        <td>{val(vessel.description)}</td>
                        <td>Drawing No.</td>
                        <td>{val(vessel.drawing_number)}</td>
                    </tr>
                    <tr>
                        <td>Material</td>
                        <td>{val(vessel.material)}</td>
                        <td>Nominal Thickness</td>
                        <td>{val(vessel.nominal_thickness)}</td>
                    </tr>
                    <tr>
                        <td>Line / Tag No.</td>
                        <td>{val(vessel.line_tag_number)}</td>
                        <td>Operating Temp.</td>
                        <td>{val(vessel.operating_temperature)}</td>
                    </tr>
                    <tr>
                        <td>Corrosion Allow.</td>
                        <td>{val(vessel.corrosion_allowance)}</td>
                        <td>Stress Relief</td>
                        <td>{val(vessel.stress_relief)}</td>
                    </tr>
                    <tr>
                        <td>Coating Type</td>
                        <td>{val(vessel.coating_type)}</td>
                        <td>Coating Correction</td>
                        <td>{val(vessel.coating_correction)}</td>
                    </tr>
                    <tr>
                        <td>Procedure Ref.</td>
                        <td>{val(procedure?.procedure_number)}</td>
                        <td>Technique No.</td>
                        <td>{val(procedure?.technique_numbers)}</td>
                    </tr>
                    <tr>
                        <td>Acceptance Criteria</td>
                        <td>{val(procedure?.acceptance_criteria)}</td>
                        <td>Applicable Standard</td>
                        <td>{val(procedure?.applicable_standard)}</td>
                    </tr>
                </tbody>
            </table>

            {/* Equipment */}
            <div className="report-section-header">Equipment</div>
            <table className="report-table report-table--pairs">
                <tbody>
                    <tr>
                        <td>Instrument</td>
                        <td>{val(equip.model)}</td>
                        <td>Serial No.</td>
                        <td>{val(equip.serial_no)}</td>
                    </tr>
                    <tr>
                        <td>Probe</td>
                        <td>{val(equip.probe)}</td>
                        <td>Wedge</td>
                        <td>{val(equip.wedge)}</td>
                    </tr>
                    <tr>
                        <td>Scanner / Frame</td>
                        <td>{val(equip.scanner_frame)}</td>
                        <td>Ref. Blocks</td>
                        <td>{val(equip.ref_blocks)}</td>
                    </tr>
                    <tr>
                        <td>Couplant</td>
                        <td>{val(equip.couplant)}</td>
                        <td>Equipment Checks</td>
                        <td>{val(equip.equipment_checks_ref)}</td>
                    </tr>
                </tbody>
            </table>

            {/* Beamset Configuration */}
            {beamset.length > 0 && (
                <>
                    <div className="report-section-header">Beamset Configuration</div>
                    <table className="report-table report-table--branded">
                        <thead>
                            <tr>
                                <th>Group</th>
                                <th>Type</th>
                                <th>Active Elements</th>
                                <th>Aperture</th>
                                <th>Focal Depth</th>
                                <th>Angle</th>
                                <th>Skew</th>
                                <th>Index Offset</th>
                            </tr>
                        </thead>
                        <tbody>
                            {beamset.map((row: BeamsetRow, idx: number) => (
                                <tr key={idx}>
                                    <td>{val(row.group)}</td>
                                    <td>{val(row.type)}</td>
                                    <td>{val(row.active_elements)}</td>
                                    <td>{val(row.aperture)}</td>
                                    <td>{val(row.focal_depth)}</td>
                                    <td>{val(row.angle)}</td>
                                    <td>{val(row.skew)}</td>
                                    <td>{val(row.index_offset)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            {/* Results Summary */}
            {vessel.results_summary && (
                <>
                    <div className="report-section-header">Results Summary</div>
                    <div className="report-analysis">{vessel.results_summary}</div>
                </>
            )}

            {/* Sign-off */}
            <div className="report-section-header report-section-header--dark">Sign-off</div>
            <div className="report-signoff">
                <SignoffColumn title="Technician" person={signoff.technician} />
                <SignoffColumn title="Reviewer" person={signoff.reviewer} />
                <SignoffColumn title="Client Acceptance" person={signoff.client} />
            </div>
        </div>
    );
}
