"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { CausalGraph as CausalGraphType, CausalNode, CausalEdge } from "@/lib/types";
import { Info } from "lucide-react";

interface Props {
  data: CausalGraphType;
}

interface D3Node extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  centrality: number;
  avg_return: number;
  volatility: number;
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  weight: number;
  p_value: number;
  direction: "positive" | "negative";
}

export default function CausalGraph({ data }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ node: D3Node | null; x: number; y: number }>({
    node: null,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    if (!svgRef.current || !data.nodes.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth || 600;
    const height = 420;

    const nodes: D3Node[] = data.nodes.map((n) => ({ ...n }));
    const links: D3Link[] = data.edges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
      p_value: e.p_value,
      direction: e.direction,
    }));

    // Arrowhead marker
    svg
      .append("defs")
      .selectAll("marker")
      .data(["positive", "negative"])
      .enter()
      .append("marker")
      .attr("id", (d) => `arrow-${d}`)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 22)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", (d) => (d === "positive" ? "#22c55e" : "#ef4444"));

    const simulation = d3
      .forceSimulation<D3Node>(nodes)
      .force(
        "link",
        d3
          .forceLink<D3Node, D3Link>(links)
          .id((d) => d.id)
          .distance(130)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide(50));

    const g = svg.append("g");

    // Zoom
    svg.call(
      d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.5, 3]).on("zoom", (event) => {
        g.attr("transform", event.transform);
      })
    );

    // Links
    const link = g
      .append("g")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", (d) => (d.direction === "positive" ? "#22c55e" : "#ef4444"))
      .attr("stroke-width", (d) => Math.max(1, Math.min(5, d.weight * 20)))
      .attr("stroke-opacity", 0.7)
      .attr("marker-end", (d) => `url(#arrow-${d.direction})`);

    // Edge weight labels
    const edgeLabels = g
      .append("g")
      .selectAll("text")
      .data(links)
      .enter()
      .append("text")
      .attr("text-anchor", "middle")
      .attr("font-size", 9)
      .attr("fill", "#64748b")
      .text((d) => d.weight.toFixed(3));

    // Node groups
    const nodeGroup = g
      .append("g")
      .selectAll("g")
      .data(nodes)
      .enter()
      .append("g")
      .attr("cursor", "pointer")
      .call(
        d3
          .drag<SVGGElement, D3Node>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on("mouseover", (event, d) => {
        setTooltip({ node: d, x: event.offsetX, y: event.offsetY });
      })
      .on("mouseout", () => {
        setTooltip({ node: null, x: 0, y: 0 });
      });

    // Node circles (size = centrality)
    nodeGroup
      .append("circle")
      .attr("r", (d) => 20 + d.centrality * 20)
      .attr("fill", (d) => {
        if (d.centrality > 0.6) return "rgba(59,130,246,0.3)";
        if (d.centrality > 0.3) return "rgba(99,102,241,0.25)";
        return "rgba(30,41,59,0.8)";
      })
      .attr("stroke", (d) => {
        if (d.centrality > 0.6) return "#3b82f6";
        if (d.centrality > 0.3) return "#6366f1";
        return "#334155";
      })
      .attr("stroke-width", 2);

    // Node labels
    nodeGroup
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-size", 13)
      .attr("font-family", "JetBrains Mono, monospace")
      .attr("font-weight", "600")
      .attr("fill", "#f1f5f9")
      .text((d) => d.label);

    // Simulation tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as D3Node).x!)
        .attr("y1", (d) => (d.source as D3Node).y!)
        .attr("x2", (d) => (d.target as D3Node).x!)
        .attr("y2", (d) => (d.target as D3Node).y!);

      edgeLabels
        .attr(
          "x",
          (d) => ((d.source as D3Node).x! + (d.target as D3Node).x!) / 2
        )
        .attr(
          "y",
          (d) => ((d.source as D3Node).y! + (d.target as D3Node).y!) / 2
        );

      nodeGroup.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [data]);

  const hasEdges = data.edges.length > 0;

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-white">Causal Graph</h3>
          <p className="text-xs text-slate-500">
            {data.algorithm} · α={data.significance_threshold} · drag nodes · scroll to zoom
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="h-2 w-4 rounded bg-green-500" /> positive
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-4 rounded bg-red-500" /> negative
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-full bg-brand-500/30 border border-brand-500" /> high centrality
          </span>
        </div>
      </div>

      {/* Empty state */}
      {!hasEdges && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-400">
          <Info className="h-4 w-4 flex-shrink-0" />
          <span>{data.message || "No significant causal edges found — assets appear independent (good for diversification)."}</span>
        </div>
      )}

      <svg
        ref={svgRef}
        width="100%"
        height="420"
        className="overflow-hidden rounded-lg bg-surface"
        style={{ minHeight: 420 }}
      />

      {/* Tooltip */}
      {tooltip.node && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-surface-border bg-surface-card p-3 text-xs shadow-2xl"
          style={{ left: tooltip.x + 12, top: tooltip.y - 30 }}
        >
          <p className="font-mono font-bold text-white">{tooltip.node.label}</p>
          <p className="text-slate-400">
            Centrality: {tooltip.node.centrality.toFixed(2)}
          </p>
          <p
            className={
              tooltip.node.avg_return >= 0 ? "text-green-400" : "text-red-400"
            }
          >
            Avg Return: {(tooltip.node.avg_return * 100).toFixed(1)}% / yr
          </p>
          <p className="text-slate-400">
            Volatility: {(tooltip.node.volatility * 100).toFixed(1)}% / yr
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="mt-4 flex gap-6 text-xs text-slate-500">
        <span>{data.nodes.length} assets</span>
        <span>{data.edges.length} causal edges</span>
        {data.nodes.length > 0 && (
          <span>
            Most central:{" "}
            <strong className="text-slate-300">
              {[...data.nodes].sort((a, b) => b.centrality - a.centrality)[0]?.label}
            </strong>
          </span>
        )}
      </div>

      {/* Correlation Heatmap */}
      {data.correlation_matrix && Object.keys(data.correlation_matrix).length > 0 && (
        <CorrelationHeatmap matrix={data.correlation_matrix} />
      )}
    </div>
  );
}

function CorrelationHeatmap({
  matrix,
}: {
  matrix: Record<string, Record<string, number>>;
}) {
  const tickers = Object.keys(matrix);
  const [hoveredCell, setHoveredCell] = useState<{ row: string; col: string; val: number } | null>(null);

  function corrColor(val: number): string {
    // Red (−1) → White (0) → Green (+1)
    const abs = Math.abs(val);
    if (val > 0) {
      const g = Math.round(180 + abs * 75);
      const rb = Math.round(255 - abs * 200);
      return `rgb(${rb},${g},${rb})`;
    } else {
      const r = Math.round(180 + abs * 75);
      const gb = Math.round(255 - abs * 200);
      return `rgb(${r},${gb},${gb})`;
    }
  }

  return (
    <div className="mt-6 border-t border-surface-border pt-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-white">Pearson Correlation Matrix</h4>
          <p className="text-xs text-slate-500">
            How closely each pair of assets moves together (−1 = inverse, +1 = identical)
          </p>
        </div>
        <div className="flex gap-2 text-xs text-slate-500 items-center">
          <span className="inline-block h-3 w-6 rounded" style={{ background: "rgb(55,180,55)" }} /> +1
          <span className="inline-block h-3 w-6 rounded bg-white" /> 0
          <span className="inline-block h-3 w-6 rounded" style={{ background: "rgb(180,55,55)" }} /> −1
        </div>
      </div>

      <div className="overflow-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="w-16" />
              {tickers.map((col) => (
                <th
                  key={col}
                  className="px-2 py-1 font-mono text-slate-400 text-center font-medium"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickers.map((row) => (
              <tr key={row}>
                <td className="pr-2 py-0.5 font-mono text-slate-400 font-medium text-right whitespace-nowrap">
                  {row}
                </td>
                {tickers.map((col) => {
                  const val = matrix[row]?.[col] ?? 0;
                  const isDiag = row === col;
                  const isHovered = hoveredCell?.row === row && hoveredCell?.col === col;
                  return (
                    <td
                      key={col}
                      className="relative p-0.5 text-center"
                      onMouseEnter={() => setHoveredCell({ row, col, val })}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      <div
                        className="rounded px-2 py-1 font-mono text-xs font-medium transition-all cursor-default"
                        style={{
                          background: isDiag ? "rgba(255,255,255,0.05)" : corrColor(val),
                          color: isDiag ? "#64748b" : Math.abs(val) > 0.5 ? "#000" : "#333",
                          outline: isHovered ? "2px solid #3b82f6" : "none",
                        }}
                      >
                        {isDiag ? "—" : val.toFixed(2)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hoveredCell && hoveredCell.row !== hoveredCell.col && (
        <p className="mt-2 text-xs text-slate-400">
          <strong className="font-mono text-white">{hoveredCell.row}</strong>
          {" ↔ "}
          <strong className="font-mono text-white">{hoveredCell.col}</strong>
          {": "}
          <span
            className={
              hoveredCell.val > 0.3
                ? "text-green-400"
                : hoveredCell.val < -0.3
                ? "text-red-400"
                : "text-slate-300"
            }
          >
            {hoveredCell.val.toFixed(4)}{" "}
            {hoveredCell.val > 0.7
              ? "(strong positive)"
              : hoveredCell.val > 0.3
              ? "(moderate positive)"
              : hoveredCell.val < -0.7
              ? "(strong negative)"
              : hoveredCell.val < -0.3
              ? "(moderate negative)"
              : "(weak / uncorrelated)"}
          </span>
        </p>
      )}
    </div>
  );
}
