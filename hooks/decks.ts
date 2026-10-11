// Starter decks: standard A-Level definitions and results. Same format as a
// deck file in ~/.claude/study/ or <project>/.claude/study/.

export const STARTER_DECKS: readonly string[] = [
  `# H2 Physics

Q: Define electric potential at a point.
A: The work done per unit positive charge in bringing a small test charge from infinity to that point.

Q: State Newton's law of gravitation.
A: Two point masses attract each other with a force directly proportional to the product of their masses and inversely proportional to the square of their separation. F = GMm/r²

Q: Define simple harmonic motion.
A: Motion in which the acceleration is directly proportional to the displacement from a fixed point and always directed towards that point. a = −ω²x

Q: State the principle of superposition.
A: When two or more waves meet at a point, the resultant displacement is the vector sum of the individual displacements.

Q: Define the tesla.
A: The magnetic flux density of a uniform field in which a straight conductor of length 1 m carrying a current of 1 A, placed perpendicular to the field, experiences a force of 1 N.

Q: State Faraday's law of electromagnetic induction.
A: The induced e.m.f. is directly proportional to the rate of change of magnetic flux linkage.

Q: State Lenz's law.
A: The induced e.m.f. (and current) is in a direction that tends to oppose the change in flux producing it.

Q: Define e.m.f.
A: The energy converted from other forms to electrical energy per unit charge driven round a complete circuit.

Q: Write Einstein's photoelectric equation.
A: hf = Φ + ½mv²max, where Φ is the work function.

Q: Define specific heat capacity.
A: The thermal energy required per unit mass to raise the temperature of a substance by one unit (1 K) without a change of state.
`,
  `# H2 Chemistry

Q: Define first ionisation energy.
A: The energy required to remove one mole of electrons from one mole of gaseous atoms to form one mole of gaseous singly charged cations. X(g) → X⁺(g) + e⁻

Q: Define standard enthalpy change of formation.
A: The enthalpy change when one mole of a substance is formed from its constituent elements in their standard states under standard conditions (298 K, 1 bar).

Q: Define lattice energy (H2 convention).
A: The energy released when one mole of a solid ionic compound is formed from its constituent gaseous ions under standard conditions. Always exothermic.

Q: State Hess's law.
A: The enthalpy change of a reaction depends only on the initial and final states, not on the route taken.

Q: State Le Chatelier's principle.
A: If a system in dynamic equilibrium is subjected to a change in conditions, the position of equilibrium shifts so as to partially counteract that change.

Q: Define a Brønsted–Lowry acid and base.
A: Acid: proton (H⁺) donor. Base: proton (H⁺) acceptor.

Q: Define a buffer solution.
A: A solution that resists a change in pH when a small amount of acid or base is added.

Q: Define the order of reaction with respect to a reactant.
A: The power to which the concentration of that reactant is raised in the experimentally determined rate equation.

Q: Half-life of a first-order reaction?
A: t½ = ln 2 / k: constant, independent of the initial concentration.
`,
  `# H2 Mathematics

Q: Maclaurin series of eˣ?
A: 1 + x + x²/2! + x³/3! + … (valid for all real x)

Q: Maclaurin series of ln(1 + x)?
A: x − x²/2 + x³/3 − … (valid for −1 < x ≤ 1)

Q: Integration by parts?
A: ∫ u (dv/dx) dx = uv − ∫ v (du/dx) dx

Q: Sum to infinity of a geometric series?
A: S∞ = a / (1 − r), valid only when |r| < 1.

Q: State de Moivre's theorem.
A: (cos θ + i sin θ)ⁿ = cos nθ + i sin nθ

Q: Mean and variance of X ~ B(n, p)?
A: E(X) = np, Var(X) = np(1 − p)

Q: d/dx (tan x)?
A: sec² x

Q: d/dx (sin⁻¹ x)?
A: 1 / √(1 − x²)

Q: Perpendicular distance from point A (position vector a) to the plane r · n = d?
A: |a · n − d| / |n|

Q: State the Central Limit Theorem (as used in H2).
A: For a large sample (n ≥ 30) from any population with mean μ and variance σ², the sample mean X̄ is approximately N(μ, σ²/n).
`,
  `# H2 Economics

Q: Define opportunity cost.
A: The value of the next best alternative forgone when a choice is made.

Q: Define price elasticity of demand (PED).
A: The responsiveness of quantity demanded of a good to a change in its own price, ceteris paribus. PED = %ΔQd / %ΔP

Q: What does income elasticity of demand (YED) tell you about a good?
A: YED > 0: normal good (YED > 1: income-elastic, often a luxury). YED < 0: inferior good.

Q: Define market failure.
A: When the free market fails to allocate resources efficiently, producing at an output where MSB ≠ MSC (allocative inefficiency).

Q: Define a public good.
A: A good that is non-excludable and non-rivalrous in consumption, so the free market tends not to provide it (free-rider problem).

Q: Define a negative externality in production.
A: A cost imposed on third parties not involved in the transaction and not reflected in the price, so MSC > MPC.

Q: Define comparative advantage.
A: A country has a comparative advantage in a good if it can produce it at a lower opportunity cost than another country.

Q: What is Singapore's main monetary policy tool?
A: The exchange rate: MAS manages the S$NEER within an undisclosed policy band, adjusting its slope, width and centre.

Q: Size of the Keynesian multiplier in an open economy with taxes?
A: k = 1 / (MPS + MPT + MPM) = 1 / MPW
`,
]
